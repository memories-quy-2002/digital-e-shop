import { Injectable, Optional } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { getReturnDeadline } from "../after-sales/after-sales.policy";
import { CHECKOUT_RESERVATION_STATUS } from "#src/shared/constants/checkout-reservation";
import { CURRENCY_CODE } from "#src/shared/constants/currency";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CartItemRow, CartValidationIssue } from "../cart/cart.types";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import type { GuestOrderIdentityRow, GuestSafeOrderDetail, OrderBySessionRow, OrderDetail, OrderDetailRow, OrderIdentity, OrderSummaryRow, OrderTimelineRow, LockedProductRow, PendingCheckoutRow } from "./orders.types";
import type { PromotionRow } from "../promotions/promotions.types";
import type { GuestPurchasePayload, PurchasePayload } from "./orders.dto";
import { OrdersRepository } from "./orders.repository";
import { NestOrderTimelineService } from "./orders.timeline.service";
import { NestCartService } from "../cart/cart.service";
import { NestInventoryService } from "../inventory/inventory.service";
import { NestNotificationsService } from "../notifications/notifications.service";
import { withTransaction } from "../database/transaction";
import type { TransactionContext } from "../database/transaction";
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { PromotionsRepository } from "../promotions/promotions.repository";
import { ProductAttributesRepository } from "../products/product-attributes.repository";
import { buildOrderItemSnapshot } from "./orders.snapshot";
import { PaymentProviderService } from "../payments/payment-provider.service";
import { buildPaymentQuote } from "../payments/currency";
import { PAYMENT_PROVIDER, PAYMENT_STATUS, type PaymentProviderName, type PaymentQuote } from "../payments/payment.types";
import { generateGuestOrderToken, hashGuestOrderToken, matchesGuestOrderToken } from "./guest-order-token";
import { NestOrdersCancellationService } from "./orders-cancellation.service";
import { createCheckoutError } from "./orders.errors";
import { ShippingQuoteService, type QuoteCheckout } from "../shipping/shipping-quote.service";
import { completeDeliveredOrder } from "./order-delivery";
import { OrderEmailService } from "./order-email.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { ShippingRepository } from "../shipping/shipping.repository";

export { createCheckoutError } from "./orders.errors";

export type PayOSAttemptFinalizationResult =
    | { orderId: number; created: boolean }
    | { reviewRequired: true; reason: string };


const normalizePaymentProvider = (paymentMethod: string): PaymentProviderName => paymentMethod as PaymentProviderName;

const roundCurrency = (value: number): number => Math.round(value + Number.EPSILON);

const normalizeSalePrice = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

type CreateOrderFromCartInputBase = {
    deliveryCheckout?: QuoteCheckout;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    guestQuote?: {
        cart: CartItemRow[];
        merchandiseTotal: number;
        discount: number;
    };
    shippingAddress: string;
    paymentMethod: PaymentProviderName;
    loyaltyPoints?: number;
    discountCode?: string;
};

type CreateOrderFromCartInput = CreateOrderFromCartInputBase & (
    | { uid: string; identity?: never }
    | { identity: OrderIdentity; uid?: never }
);

@Injectable()
export class NestOrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly orderTimelineService: NestOrderTimelineService,
        private readonly cartService: NestCartService,
        private readonly inventoryService: NestInventoryService,
        private readonly notificationsService: NestNotificationsService,
        private readonly checkoutReservationRepository: CheckoutReservationRepository,
        private readonly promotionsRepository: PromotionsRepository,
        private readonly productAttributesRepository: ProductAttributesRepository,
        private readonly ordersCancellationService: NestOrdersCancellationService,
        private readonly shippingRepository: ShippingRepository,
        @Optional() private readonly paymentProviderService?: PaymentProviderService,
        @Optional() private readonly shippingQuoteService?: ShippingQuoteService,
        @Optional() private readonly orderEmails?: OrderEmailService,
        @Optional() private readonly loyaltyService?: LoyaltyService,
    ) {}

    private async createPaymentLedgerInTransaction(
        tx: TransactionContext,
        {
            orderId,
            paymentMethod,
            baseAmount,
            providerPaymentId = null,
            providerReference = null,
            paymentQuote,
            status = PAYMENT_STATUS.PENDING,
        }: {
            orderId: number;
            paymentMethod: PaymentProviderName;
            baseAmount: number;
            providerPaymentId?: string | null;
            providerReference?: string | null;
            paymentQuote?: PaymentQuote;
            status?: typeof PAYMENT_STATUS.PENDING | typeof PAYMENT_STATUS.PAID;
        },
    ) {
        const provider = normalizePaymentProvider(paymentMethod);
        const quote = paymentQuote || buildPaymentQuote(baseAmount, provider);
        const providerResult = this.paymentProviderService
            ? await this.paymentProviderService.createPayment({
                provider,
                orderId,
                amount: quote.amount,
                currency: quote.currency,
                providerPaymentId,
                providerReference,
            })
            : null;
        const paymentStatus = status === PAYMENT_STATUS.PAID ? PAYMENT_STATUS.PAID : providerResult?.status || PAYMENT_STATUS.PENDING;

        await this.ordersRepository.insertPaymentLedgerInTransaction(tx, {
            orderId, provider, status: paymentStatus,
            providerReference: providerResult?.providerReference || providerReference || providerPaymentId,
            providerPaymentId, quote, simulated: Boolean(providerResult?.simulated),
        });
    }

    private getOrderSummary(orderId: number): Promise<OrderSummaryRow> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderById(orderId, (error: Error | null, rows: OrderSummaryRow[]) => {
                if (error) return reject(error);
                if (!rows?.[0]) return reject(createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND));
                resolve(rows[0]);
            });
        });
    }

    async cancelOrder(orderId: number, actorId: string, admin = false, reason?: string): Promise<OrderSummaryRow> {
        const result = await this.ordersCancellationService.cancelOrder(orderId, actorId, admin, reason);
        if (result.changed && result.userId) this.notificationsService.notifyOrderStatus(result.userId, orderId, ORDER_STATUS.CANCELED);
        return this.getOrderSummary(orderId);
    }

    private async loadGuestTransactionalCart(
        tx: TransactionContext,
        expectedCart: CartItemRow[],
        expectedMerchandiseTotal: number,
    ): Promise<{
        cart: CartItemRow[];
        merchandiseTotal: number;
        lockedProducts: LockedProductRow[];
    }> {
        const quantitiesByProductId = new Map<number, number>();
        for (const item of expectedCart) {
            const productId = Number(item.product_id || 0);
            const quantity = Number(item.quantity) || 0;
            if (Number.isSafeInteger(productId) && productId > 0 && Number.isSafeInteger(quantity) && quantity > 0) {
                quantitiesByProductId.set(productId, (quantitiesByProductId.get(productId) || 0) + quantity);
            }
        }

        const productIds = [...quantitiesByProductId.keys()].sort((left, right) => left - right);
        const lockedProducts = await this.checkoutReservationRepository.lockProductsForPurchase(tx, productIds);
        const activeReservations = await this.checkoutReservationRepository.getActiveReservationQuantities(tx, productIds);
        const lockedByProductId = new Map(lockedProducts.map((product) => [product.id, product]));
        const reservedByProductId = new Map(
            activeReservations.map((row) => [row.product_id, Number(row.reserved_quantity) || 0]),
        );
        const expectedByProductId = new Map(
            expectedCart.map((item) => [Number(item.product_id || 0), item]),
        );
        const cart: CartItemRow[] = [];
        const issues: CartValidationIssue[] = [];
        const priceMismatches: Array<Record<string, unknown>> = [];

        for (const productId of productIds) {
            const expectedItem = expectedByProductId.get(productId);
            const product = lockedByProductId.get(productId);
            const stock = product ? Number(product.stock) || 0 : 0;
            const reserved = reservedByProductId.get(productId) || 0;
            const availableStock = Math.max(stock - reserved, 0);
            const quantity = quantitiesByProductId.get(productId) || 0;
            const productName = String(product?.name || expectedItem?.product_name || `Product #${productId}`);

            if (!product || availableStock < quantity) {
                issues.push({
                    cartItemId: Number(expectedItem?.cart_item_id || 0),
                    productId,
                    productName,
                    requestedQuantity: quantity,
                    availableStock,
                    reason: !product ? "unavailable" : availableStock <= 0 ? "out_of_stock" : "insufficient_stock",
                });
                continue;
            }

            const actualPrice = Number(product.price);
            const actualSalePrice = normalizeSalePrice(product.sale_price);
            const expectedPrice = Number(expectedItem?.price);
            const expectedSalePrice = normalizeSalePrice(expectedItem?.sale_price);
            if (
                !Number.isFinite(actualPrice)
                || Math.abs(actualPrice - expectedPrice) > 0.01
                || actualSalePrice !== expectedSalePrice
            ) {
                priceMismatches.push({
                    productId,
                    productName,
                    expectedPrice,
                    actualPrice,
                    expectedSalePrice,
                    actualSalePrice,
                });
            }

            cart.push({
                product_id: product.id,
                product_name: product.name,
                sku: product.sku,
                warranty_months: product.warranty_months === null || product.warranty_months === undefined
                    ? null
                    : Number(product.warranty_months),
                brand: product.brand,
                category: product.category,
                price: actualPrice,
                sale_price: actualSalePrice,
                stock,
                available_stock: availableStock,
                main_image: product.main_image,
                specifications: product.specifications,
                quantity,
            });
        }

        if (issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                { issues, authoritativeCart: cart, authoritativeTotalPrice: expectedMerchandiseTotal },
            );
        }

        const merchandiseTotal = roundCurrency(cart.reduce((total, item) => {
            const unitPrice = normalizeSalePrice(item.sale_price) ?? (Number(item.price) || 0);
            return total + unitPrice * (Number(item.quantity) || 0);
        }, 0));

        if (priceMismatches.length > 0 || Math.abs(merchandiseTotal - Number(expectedMerchandiseTotal)) > 0.01) {
            throw createCheckoutError(
                "Product prices changed while placing the order. Refresh your cart and try again.",
                409,
                {
                    mismatches: priceMismatches,
                    authoritativeCart: cart,
                    authoritativeTotalPrice: merchandiseTotal,
                },
            );
        }

        return { cart, merchandiseTotal, lockedProducts };
    }

    private async resolveOrderCartForTransaction(
        tx: TransactionContext,
        {
            identity,
            authoritativeCart,
            authoritativeTotalPrice,
            guestQuote,
        }: {
            identity: OrderIdentity;
            authoritativeCart: CartItemRow[];
            authoritativeTotalPrice: number;
            guestQuote?: CreateOrderFromCartInputBase["guestQuote"];
        },
    ): Promise<{
        cart: CartItemRow[];
        merchandiseTotal: number;
        lockedProducts: LockedProductRow[] | null;
    }> {
        if (identity.kind !== "guest") {
            const current = await this.loadGuestTransactionalCart(tx, authoritativeCart, authoritativeTotalPrice);
            return { cart: current.cart, merchandiseTotal: current.merchandiseTotal, lockedProducts: current.lockedProducts };
        }
        if (!guestQuote) {
            throw createCheckoutError("Guest checkout quote is missing. Refresh your cart and try again.", HTTP_STATUS.CONFLICT);
        }

        const guestTransaction = await this.loadGuestTransactionalCart(
            tx,
            guestQuote.cart,
            guestQuote.merchandiseTotal,
        );
        return {
            cart: guestTransaction.cart,
            merchandiseTotal: guestTransaction.merchandiseTotal,
            lockedProducts: guestTransaction.lockedProducts,
        };
    }

    private async createOrderHeaderInTransaction(
        tx: TransactionContext,
        {
            identity,
            transactionCart,
            transactionMerchandiseTotal,
            requestedDiscount,
            shippingAddress,
            paymentMethod,
            discountCode,
            loyaltyPoints = 0,
            guestQuote,
            deliveryCheckout,
        }: {
            identity: OrderIdentity;
            transactionCart: CartItemRow[];
            transactionMerchandiseTotal: number;
            requestedDiscount: number;
            shippingAddress: string;
            paymentMethod: PaymentProviderName;
            discountCode?: string;
            loyaltyPoints?: number;
            guestQuote?: CreateOrderFromCartInputBase["guestQuote"];
            deliveryCheckout?: QuoteCheckout;
        },
    ) {
        const orderResult = await this.ordersRepository.insertOrderInTransaction(tx, {
            userId: identity.userId,
            guestEmail: identity.kind === "guest" ? identity.guestContact.guestEmail : null,
            guestName: identity.kind === "guest" ? identity.guestContact.guestName : null,
            guestPhone: identity.kind === "guest" ? identity.guestContact.guestPhone ?? null : null,
            guestOrderTokenHash: identity.kind === "guest" ? identity.guestOrderTokenHash : null,
            totalPrice: transactionMerchandiseTotal,
            discount: identity.kind === "guest" ? 0 : requestedDiscount,
            shippingAddress,
            paymentMethod,
            currency: env.storeCurrency,
        });
        const orderId = orderResult.insertId;
        logger.debug({ orderId }, "[createOrderFromValidatedCart] order inserted");

        let appliedDiscount = requestedDiscount;
        if (discountCode) {
            const promotion = await this.promotionsRepository.consumePromotion(
                tx,
                discountCode,
                identity.userId,
                orderId,
                transactionMerchandiseTotal,
            );
            appliedDiscount = promotion.discount;
            if (
                identity.kind === "guest"
                && guestQuote
                && Math.abs(appliedDiscount - Number(guestQuote.discount)) > 0.01
            ) {
                throw createCheckoutError(
                    "The promotion changed while placing the order. Refresh your cart and try again.",
                    409,
                    {
                        authoritativeCart: transactionCart,
                        authoritativeTotalPrice: transactionMerchandiseTotal,
                    },
                );
            }
            if (appliedDiscount !== (identity.kind === "guest" ? 0 : requestedDiscount)) {
                await this.ordersRepository.updateOrderDiscountInTransaction(tx, orderId, appliedDiscount);
            }
        }

        if (!this.shippingQuoteService || !deliveryCheckout) throw createCheckoutError("A delivery quote is required", HTTP_STATUS.CONFLICT);
        const delivery = await this.shippingQuoteService.validateQuote(tx, deliveryCheckout, transactionCart, transactionMerchandiseTotal, appliedDiscount);
        if (loyaltyPoints > 0 && identity.kind !== "authenticated") throw createCheckoutError("Sign in to use loyalty points.", HTTP_STATUS.UNAUTHORIZED);
        const loyaltyDiscount = loyaltyPoints > 0
            ? await this.loyaltyService?.redeemOrderPoints(
                tx,
                identity.userId as string,
                orderId,
                loyaltyPoints,
                delivery.pricing.itemsSubtotal,
                delivery.pricing.merchandiseDiscount,
            )
            : 0;
        if (loyaltyPoints > 0 && loyaltyDiscount === undefined) throw new Error("Loyalty point checkout is not configured");
        const pointsDiscount = Number(loyaltyDiscount) || 0;
        const pricingSnapshot = {
            ...delivery.pricing,
            promotionDiscount: delivery.pricing.merchandiseDiscount,
            loyaltyDiscount: pointsDiscount,
            loyaltyPointsRedeemed: loyaltyPoints,
            merchandiseDiscount: delivery.pricing.merchandiseDiscount + pointsDiscount,
            payableTotal: delivery.pricing.payableTotal - pointsDiscount,
        };
        appliedDiscount = pricingSnapshot.merchandiseDiscount;
        await tx.query("UPDATE orders SET total_price = ?, discount = ?, loyalty_points_redeemed = ?, loyalty_discount = ?, pricing_snapshot = ?, delivery_snapshot = ?, shipping_address = ? WHERE id = ?",
            [delivery.pricing.itemsSubtotal + delivery.pricing.shippingFee, appliedDiscount, loyaltyPoints, pointsDiscount, JSON.stringify(pricingSnapshot), JSON.stringify(delivery.delivery), JSON.stringify(delivery.delivery.address), orderId]);
        await this.createPaymentLedgerInTransaction(tx, {
            orderId,
            paymentMethod,
            baseAmount: pricingSnapshot.payableTotal,
        });
        await this.shippingRepository.initializeOrderShipment(tx, orderId);

        return { orderId, appliedDiscount };
    }

    private async buildOrderItemRows(
        tx: TransactionContext,
        orderId: number,
        transactionCart: CartItemRow[],
    ): Promise<{ values: unknown[][]; productQuantities: Map<number, number> }> {
        const productIdsForSnapshot = [...new Set(transactionCart.map((item) => Number(item.product_id || 0)).filter(Boolean))];
        const productAttributes = await this.productAttributesRepository.getForProducts(tx, productIdsForSnapshot);
        const orderItemSnapshots = transactionCart.map((item) =>
            buildOrderItemSnapshot(item, productAttributes.get(Number(item.product_id || 0))),
        );
        const values = orderItemSnapshots.map((snapshot) => [
            orderId,
            snapshot.productId,
            snapshot.quantity,
            snapshot.unitPrice * snapshot.quantity,
            snapshot.sku,
            snapshot.productName,
            snapshot.image,
            snapshot.unitPrice,
            snapshot.brand,
            snapshot.category,
            snapshot.warrantyMonths,
            JSON.stringify(snapshot.specifications),
        ]);
        const productQuantities = transactionCart.reduce((acc: Map<number, number>, product: CartItemRow) => {
            const productId = Number(product.product_id || 0);
            const quantity = Number(product.quantity) || 0;
            const currentQuantity = acc.get(productId) || 0;
            acc.set(productId, currentQuantity + quantity);
            return acc;
        }, new Map<number, number>());

        return { values, productQuantities };
    }

    private async recordOrderInventorySale(
        tx: TransactionContext,
        {
            orderId,
            userId,
            transactionCart,
            transactionMerchandiseTotal,
            productQuantities,
            guestLockedProducts,
        }: {
            orderId: number;
            userId: string | null;
            transactionCart: CartItemRow[];
            transactionMerchandiseTotal: number;
            productQuantities: Map<number, number>;
            guestLockedProducts: LockedProductRow[] | null;
        },
    ): Promise<InventoryMovementInput[]> {
        const productIds = [...productQuantities.keys()].sort((left, right) => left - right);
        const authoritativeItemsById = new Map(
            transactionCart.map((item: CartItemRow) => [Number(item.product_id || 0), item] as const),
        );
        const lockedProducts = guestLockedProducts || await this.ordersRepository.lockProductsForOrderInTransaction(tx, productIds);
        const stockById = new Map(lockedProducts.map((row) => [row.id, Number(row.stock) || 0]));

        for (const [productId, quantity] of productQuantities.entries()) {
            const authoritativeItem = authoritativeItemsById.get(productId);
            const productName = String(authoritativeItem?.product_name || `Product #${productId}`);
            const stock = stockById.get(productId);
            if (stock == null) {
                const issues: CartValidationIssue[] = [{
                    cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                    productId,
                    productName,
                    requestedQuantity: quantity,
                    availableStock: 0,
                    reason: "unavailable",
                }];
                throw createCheckoutError(
                    `${productName} is no longer available. Remove it from your cart and try again.`,
                    409,
                    {
                        issues,
                        authoritativeCart: transactionCart,
                        authoritativeTotalPrice: transactionMerchandiseTotal,
                    },
                );
            }
            if (stock < quantity) {
                const issues: CartValidationIssue[] = [{
                    cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                    productId,
                    productName,
                    requestedQuantity: quantity,
                    availableStock: Number(stock) || 0,
                    reason: stock <= 0 ? "out_of_stock" : "insufficient_stock",
                }];
                throw createCheckoutError(
                    `${productName} only has ${stock} item(s) left. Update your cart and try again.`,
                    409,
                    {
                        issues,
                        authoritativeCart: transactionCart,
                        authoritativeTotalPrice: transactionMerchandiseTotal,
                    },
                );
            }
        }

        const inventoryMovements = [...productQuantities.entries()].reduce(
            (movements: InventoryMovementInput[], [productId, quantity]) => {
                if (!stockById.has(productId)) {
                    logger.warn(
                        { userId, productId, orderId },
                        "[createOrderFromValidatedCart] skipping inventory movement — no locked stock row for product",
                    );
                    return movements;
                }
                const stockBefore = Number(stockById.get(productId)) || 0;
                movements.push({
                    productId,
                    orderId,
                    movementType: "sale",
                    quantityChange: -quantity,
                    stockBefore,
                    stockAfter: Math.max(stockBefore - quantity, 0),
                    note: `Stock deducted for order #${orderId}`,
                    actorId: userId,
                });
                return movements;
            },
            [],
        );

        for (const productId of productIds) {
            const quantity = productQuantities.get(productId) || 0;
            const result = await this.ordersRepository.decrementProductStockInTransaction(tx, productId, quantity);
            if (result.affectedRows !== 1) {
                throw createCheckoutError("Stock changed while placing the order. Please try again.", HTTP_STATUS.CONFLICT);
            }
        }
        await this.inventoryService.createMovementsInTransaction(tx, inventoryMovements);
        return inventoryMovements;
    }

    async createOrderFromValidatedCart({
        uid,
        identity: suppliedIdentity,
        authoritativeCart,
        authoritativeTotalPrice,
        discount,
        guestQuote,
        shippingAddress,
        paymentMethod,
        discountCode,
        loyaltyPoints = 0,
        deliveryCheckout,
    }: CreateOrderFromCartInput): Promise<{ id: number; date_added: string }> {
        const identity: OrderIdentity = suppliedIdentity || { kind: "authenticated", userId: uid as string };
        const userId = identity.userId;
        const startedAt = Date.now();
        const requestedDiscount = discountCode ? Number(discount) || 0 : 0;
        logger.info({
            userId: identity.kind === "authenticated" ? identity.userId : undefined,
            identityKind: identity.kind,
            items: authoritativeCart?.length,
            authoritativeTotalPrice,
            paymentMethod,
        }, "[createOrderFromValidatedCart] start");

        const transactionResult = await withTransaction(async (tx) => {
            const cart = await this.resolveOrderCartForTransaction(tx, {
                identity,
                authoritativeCart,
                authoritativeTotalPrice,
                guestQuote,
            });
            const orderHeader = await this.createOrderHeaderInTransaction(tx, {
                identity,
                transactionCart: cart.cart,
                transactionMerchandiseTotal: cart.merchandiseTotal,
                requestedDiscount,
                loyaltyPoints,
                shippingAddress,
                paymentMethod,
                discountCode,
                guestQuote,
                deliveryCheckout,
            });
            const orderItems = await this.buildOrderItemRows(tx, orderHeader.orderId, cart.cart);
            let inventoryMovements: InventoryMovementInput[] = [];

            if (orderItems.values.length > 0) {
                logger.debug(
                    { orderId: orderHeader.orderId, count: orderItems.values.length },
                    "[createOrderFromValidatedCart] insertOrderItems",
                );
                await this.ordersRepository.insertOrderItemsInTransaction(tx, orderItems.values);
                inventoryMovements = await this.recordOrderInventorySale(tx, {
                    orderId: orderHeader.orderId,
                    userId,
                    transactionCart: cart.cart,
                    transactionMerchandiseTotal: cart.merchandiseTotal,
                    productQuantities: orderItems.productQuantities,
                    guestLockedProducts: cart.lockedProducts,
                });
            }

            if (identity.kind === "authenticated") {
                await this.ordersRepository.markOpenCartCompleteInTransaction(tx, identity.userId);
            }
            logger.debug("[createOrderFromValidatedCart] cart updated");
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId: orderHeader.orderId,
                status: ORDER_STATUS.PENDING,
                note: "Order was placed by the customer.",
                actorId: userId,
            });
            if (this.orderEmails) {
                await this.orderEmails.snapshotContact(tx, orderHeader.orderId, deliveryCheckout?.locale);
                await this.orderEmails.emit(tx, orderHeader.orderId, "placed");
            }

            const [order] = await this.ordersRepository.getOrderDateAddedInTransaction(tx, orderHeader.orderId);
            return {
                orderId: orderHeader.orderId,
                inventoryMovements,
                appliedDiscount: orderHeader.appliedDiscount,
                authoritativeTotalPrice: cart.merchandiseTotal,
                order: order || { id: orderHeader.orderId, date_added: new Date().toISOString() },
            };
        });

        if (identity.kind === "authenticated") {
            this.notificationsService.notifyOrderPlaced(
                identity.userId,
                transactionResult.orderId,
                Number(transactionResult.authoritativeTotalPrice) - Number(transactionResult.appliedDiscount || 0),
            );
        }
        logger.info({ orderId: transactionResult.orderId, ms: Date.now() - startedAt }, "[createOrderFromValidatedCart] commit ok");
        return transactionResult.order;
    }

    async makePurchase(
        uid: string,
        { totalPrice, cart, discount, discountCode, loyaltyPoints = 0, shippingAddress, paymentMethod, shippingQuoteId, deliveryAddress, locale }: PurchasePayload,
    ) {
        logger.info({ uid, items: cart?.length, totalPrice, paymentMethod }, "[makePurchase] start");

        if (!cart || cart.length === 0) {
            throw new Error("Cart is empty");
        }

        const checkoutValidation = await this.cartService.validateCheckoutSubmission(uid, cart, totalPrice);
        if (checkoutValidation.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", HTTP_STATUS.BAD_REQUEST);
        }
        if (checkoutValidation.issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                {
                    issues: checkoutValidation.issues,
                    authoritativeCart: checkoutValidation.cartItems,
                    authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
                },
            );
        }
        if (checkoutValidation.mismatches.length > 0) {
            logger.warn({
                event: "checkout submission rejected because cart values changed",
                cartItemCount: cart.length,
                mismatchCount: checkoutValidation.mismatches.length,
            });
            throw createCheckoutError(
                "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
                409,
                {
                    mismatches: checkoutValidation.mismatches,
                    authoritativeCart: checkoutValidation.cartItems,
                    authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
                },
            );
        }

        return this.createOrderFromValidatedCart({
            identity: { kind: "authenticated", userId: uid },
            deliveryCheckout: { shippingQuoteId, deliveryAddress, locale, quoteIdentity: { kind: "authenticated", userId: uid } },
            authoritativeCart: checkoutValidation.cartItems,
            authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            discount,
            loyaltyPoints,
            discountCode,
            shippingAddress,
            paymentMethod,
        });
    }

    async makeGuestPurchase(payload: GuestPurchasePayload, guestCartId?: string): Promise<{
        order: { id: number; date_added: string };
        guestOrderToken: string;
    }> {
        const preview = await this.cartService.previewGuestCart(payload.cart, payload.discountCode);
        if (preview.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", HTTP_STATUS.BAD_REQUEST);
        }
        if (preview.issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                {
                    issues: preview.issues,
                    authoritativeCart: preview.cartItems,
                    authoritativeTotalPrice: preview.merchandiseTotal,
                },
            );
        }
        if (payload.discountCode && !preview.promotion.valid) {
            throw createCheckoutError(preview.promotion.message || "Discount code is no longer valid.", HTTP_STATUS.BAD_REQUEST);
        }

        const guestOrderToken = generateGuestOrderToken();
        const identity: OrderIdentity = {
            kind: "guest",
            userId: null,
            guestContact: {
                guestEmail: payload.contact.email.trim().toLowerCase(),
                guestName: payload.contact.name.trim(),
                guestPhone: String(payload.contact.phone || "").trim() || null,
            },
            guestOrderTokenHash: hashGuestOrderToken(guestOrderToken),
        };
        const order = await this.createOrderFromValidatedCart({
            identity,
            deliveryCheckout: { shippingQuoteId: payload.shippingQuoteId, deliveryAddress: payload.deliveryAddress, locale: payload.locale, quoteIdentity: { kind: "guest", guestCartId: guestCartId || "" } },
            authoritativeCart: preview.cartItems,
            authoritativeTotalPrice: preview.merchandiseTotal,
            discount: preview.promotion.discount,
            guestQuote: {
                cart: preview.cartItems,
                merchandiseTotal: preview.merchandiseTotal,
                discount: preview.promotion.discount,
            },
            discountCode: payload.discountCode,
            shippingAddress: JSON.stringify(payload.shipping),
            paymentMethod: payload.paymentMethod,
        });

        return { order, guestOrderToken };
    }

    async lookupGuestOrder(orderId: number, guestOrderToken: string): Promise<GuestSafeOrderDetail> {
        const normalizedToken = String(guestOrderToken || "").trim();
        if (!Number.isSafeInteger(orderId) || orderId <= 0 || !normalizedToken) {
            throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
        }

        const identity = await new Promise<GuestOrderIdentityRow | null>((resolve, reject) => {
            this.ordersRepository.getGuestOrderIdentity(orderId, (error: Error | null, rows: GuestOrderIdentityRow[]) => {
                if (error) return reject(error);
                resolve(rows?.[0] || null);
            });
        });
        if (!identity || !matchesGuestOrderToken(normalizedToken, identity.guest_order_token_hash)) {
            throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
        }

        const order = await this.getOrderDetail(orderId);
        if (!order || order.user_id !== null) {
            throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
        }

        return {
            id: order.id,
            date_added: order.date_added,
            guest_email: identity.guest_email,
            guest_name: identity.guest_name,
            guest_phone: identity.guest_phone,
            status: order.status,
            total_price: order.total_price,
            discount: order.discount,
            shipping_address: order.shipping_address,
            payment_method: order.payment_method,
            currency: order.currency,
            payment_status: order.payment_status,
            payment_amount: order.payment_amount,
            payment_currency: order.payment_currency,
            payment_simulated: order.payment_simulated,
            delivered_at: order.delivered_at || null,
            return_eligible_until: order.return_eligible_until || null,
            items: order.items.map((item) => ({
                orderItemId: item.id,
                productId: item.productId,
                sku: item.sku ?? null,
                productName: item.productName,
                category: item.category,
                brand: item.brand,
                warrantyMonths: item.warrantyMonths ?? null,
                specifications: item.specifications ?? null,
                price: item.price,
                sale_price: item.sale_price ?? null,
                stock: item.stock,
                main_image: item.main_image,
                quantity: item.quantity,
                totalPrice: item.totalPrice,
            })),
        };
    }

    async getGuestOrderByPayOSOrderCode(orderCode: number, guestOrderToken: string): Promise<GuestSafeOrderDetail> {
        const normalizedToken = String(guestOrderToken || "").trim();
        if (!Number.isSafeInteger(orderCode) || orderCode <= 0 || !normalizedToken) {
            throw createCheckoutError("Order not ready yet", HTTP_STATUS.NOT_FOUND);
        }

        const pending = await new Promise<PendingCheckoutRow | null>((resolve, reject) => {
            this.ordersRepository.getPendingCheckoutByPayOSOrderCode(orderCode, (error: Error | null, rows: PendingCheckoutRow[]) => {
                if (error) return reject(error);
                resolve(rows?.[0] || null);
            });
        });
        if (pending && (pending.user_id !== null || !matchesGuestOrderToken(normalizedToken, pending.guest_order_token_hash))) {
            throw createCheckoutError("Order not ready yet", HTTP_STATUS.NOT_FOUND);
        }

        const identity = await new Promise<GuestOrderIdentityRow | null>((resolve, reject) => {
            this.ordersRepository.getGuestOrderIdentityByPayOSOrderCode(orderCode, (error: Error | null, rows: GuestOrderIdentityRow[]) => {
                if (error) return reject(error);
                resolve(rows?.[0] || null);
            });
        });
        if (!identity || !matchesGuestOrderToken(normalizedToken, identity.guest_order_token_hash)) {
            throw createCheckoutError("Order not ready yet", HTTP_STATUS.NOT_FOUND);
        }
        return this.lookupGuestOrder(identity.id, normalizedToken);
    }

    finalizePayOSCheckout(orderCode: number, paymentLinkId: string, paymentAmount: number): Promise<{ id: number; date_added: string } | null>;
    finalizePayOSCheckout(orderCode: number, paymentLinkId: string, paymentAmount: number, paymentAttemptId: string): Promise<PayOSAttemptFinalizationResult>;
    async finalizePayOSCheckout(
        orderCode: number,
        paymentLinkId: string,
        paymentAmount: number,
        paymentAttemptId?: string,
    ): Promise<{ id: number; date_added: string } | null | PayOSAttemptFinalizationResult> {
        if (paymentAttemptId) return this.finalizePayOSAttemptCheckout(orderCode, paymentLinkId, paymentAmount, paymentAttemptId);
        return this.finalizeLegacyPayOSCheckout(orderCode, paymentLinkId, paymentAmount);
    }

    private async finalizeLegacyPayOSCheckout(
        orderCode: number,
        paymentLinkId: string,
        paymentAmount: number,
    ): Promise<{ id: number; date_added: string } | null> {
        const transactionResult = await withTransaction(async (tx) => {
            const pending = await this.checkoutReservationRepository.getPendingCheckoutByProviderOrderCodeForUpdate(tx, PAYMENT_PROVIDER.PAYOS, orderCode);
            const existingOrder = await this.ordersRepository.findPayOSOrderInTransaction(tx, orderCode, paymentLinkId, paymentAmount);
            if (!pending) {
                return existingOrder
                    ? { orderId: existingOrder.id, userId: null, payableAmount: 0, alreadyProcessed: true, order: existingOrder }
                    : null;
            }

            const expectedAmount = Number(pending.payment_amount);
            if (
                pending.payment_provider !== PAYMENT_PROVIDER.PAYOS
                || String(pending.provider_order_code) !== String(orderCode)
                || String(pending.provider_reference || "") !== String(paymentLinkId)
                || pending.payment_currency !== CURRENCY_CODE.VND
                || !Number.isFinite(expectedAmount)
                || Math.abs(expectedAmount - Number(paymentAmount)) > 0.001
            ) {
                throw createCheckoutError("PayOS payment amount or reference does not match the checkout reservation.", HTTP_STATUS.CONFLICT);
            }

            if (existingOrder) {
                if (pending.status === CHECKOUT_RESERVATION_STATUS.PENDING && !pending.consumed_at) {
                    if (pending.discount_id) {
                        const consumedRows = await this.promotionsRepository.consumePromotionReservation(tx, pending.id, existingOrder.id);
                        if (consumedRows !== 1) {
                            throw createCheckoutError("Promotion reservation was already finalized.", HTTP_STATUS.CONFLICT);
                        }
                    }
                    await this.checkoutReservationRepository.consumeReservation(tx, pending.id);
                }
                return {
                    orderId: existingOrder.id,
                    userId: pending.user_id,
                    payableAmount: Number(pending.total_price) - Number(pending.discount),
                    alreadyProcessed: true,
                    order: existingOrder,
                };
            }

            const reservationExpired = !pending.expires_at || new Date(pending.expires_at).getTime() <= Date.now();
            if (pending.status !== CHECKOUT_RESERVATION_STATUS.PENDING || pending.consumed_at || reservationExpired) {
                throw createCheckoutError("Checkout reservation is no longer payable.", HTTP_STATUS.CONFLICT);
            }

            let authoritativeCart: CartItemRow[];
            try {
                authoritativeCart = JSON.parse(pending.cart_json) as CartItemRow[];
            } catch (error) {
                throw createCheckoutError("Checkout reservation contains invalid cart data.", HTTP_STATUS.INTERNAL_SERVER_ERROR, { cause: String(error) });
            }

            const reservationItems = await this.checkoutReservationRepository.getReservationItems(tx, pending.id);
            if (reservationItems.length === 0) {
                throw createCheckoutError("Checkout reservation has no inventory items.", HTTP_STATUS.CONFLICT);
            }
            const productIds = reservationItems.map((item) => item.productId).sort((left, right) => left - right);
            const lockedProducts = await this.checkoutReservationRepository.lockProducts(tx, productIds);
            const stockById = new Map(lockedProducts.map((product) => [product.id, Number(product.stock) || 0]));
            const cartItemById = new Map(
                authoritativeCart.map((item) => [Number(item.product_id || 0), item] as const),
            );
            for (const item of reservationItems) {
                const stock = stockById.get(item.productId);
                if (stock == null || stock < item.quantity) {
                    const productName = String(cartItemById.get(item.productId)?.product_name || `Product #${item.productId}`);
                    throw createCheckoutError(
                        `${productName} no longer has enough stock to complete this paid order.`,
                        409,
                        { productId: item.productId, requestedQuantity: item.quantity, availableStock: stock ?? 0 },
                    );
                }
            }

            const orderResult = await this.ordersRepository.insertOrderInTransaction(tx, {
                userId: pending.user_id,
                guestEmail: pending.guest_email,
                guestName: pending.guest_name,
                guestPhone: pending.guest_phone,
                guestOrderTokenHash: pending.guest_order_token_hash,
                totalPrice: Number(pending.total_price),
                discount: Number(pending.discount) + Number(pending.loyalty_discount || 0),
                shippingAddress: pending.shipping_address,
                paymentMethod: PAYMENT_PROVIDER.PAYOS,
                currency: env.storeCurrency,
            });
            const orderId = orderResult.insertId;
            if (pending.discount_id) {
                const consumedRows = await this.promotionsRepository.consumePromotionReservation(tx, pending.id, orderId);
                if (consumedRows !== 1) {
                    throw createCheckoutError("Promotion reservation was already finalized.", HTTP_STATUS.CONFLICT);
                }
            }

            const loyaltyPointsRedeemed = Number(pending.loyalty_points_redeemed) || 0;
            const loyaltyDiscount = Number(pending.loyalty_discount) || 0;
            const payableAmount = Math.max(Number(pending.total_price) - Number(pending.discount) - loyaltyDiscount, 0);
            await tx.query("UPDATE orders SET loyalty_points_redeemed = ?, loyalty_discount = ?, pricing_snapshot = ?, delivery_snapshot = ? WHERE id = ?", [loyaltyPointsRedeemed, loyaltyDiscount, pending.pricing_snapshot ? JSON.stringify(typeof pending.pricing_snapshot === "string" ? JSON.parse(pending.pricing_snapshot) : pending.pricing_snapshot) : null, pending.delivery_snapshot ? JSON.stringify(typeof pending.delivery_snapshot === "string" ? JSON.parse(pending.delivery_snapshot) : pending.delivery_snapshot) : null, orderId]);
            await this.createPaymentLedgerInTransaction(tx, {
                orderId,
                paymentMethod: PAYMENT_PROVIDER.PAYOS,
                baseAmount: payableAmount,
                providerPaymentId: paymentLinkId,
                providerReference: String(orderCode),
                paymentQuote: {
                    baseAmount: Number(payableAmount.toFixed(2)),
                    baseCurrency: CURRENCY_CODE.VND,
                    amount: expectedAmount,
                    currency: CURRENCY_CODE.VND,
                    fxRate: Number(pending.payment_fx_rate) || 1,
                },
                status: PAYMENT_STATUS.PAID,
            });
            await this.shippingRepository.initializeOrderShipment(tx, orderId);
            if (this.loyaltyService) await this.loyaltyService.awardPaidOrder(tx, orderId);

            const productAttributes = await this.productAttributesRepository.getForProducts(tx, productIds);
            const orderItemSnapshots = authoritativeCart.map((item) =>
                buildOrderItemSnapshot(item, productAttributes.get(Number(item.product_id || 0))),
            );
            const orderItemsValues = orderItemSnapshots.map((snapshot) => [
                orderId,
                snapshot.productId,
                snapshot.quantity,
                snapshot.unitPrice * snapshot.quantity,
                snapshot.sku,
                snapshot.productName,
                snapshot.image,
                snapshot.unitPrice,
                snapshot.brand,
                snapshot.category,
                snapshot.warrantyMonths,
                JSON.stringify(snapshot.specifications),
            ]);
            if (orderItemsValues.length > 0) {
                await this.ordersRepository.insertOrderItemsInTransaction(tx, orderItemsValues);
            }

            const inventoryMovements: InventoryMovementInput[] = [];
            for (const item of reservationItems) {
                const stockBefore = stockById.get(item.productId) || 0;
                const result = await this.ordersRepository.decrementProductStockInTransaction(tx, item.productId, item.quantity);
                if (result.affectedRows !== 1) {
                    throw createCheckoutError("Stock changed while confirming payment. The order was not created.", HTTP_STATUS.CONFLICT);
                }
                inventoryMovements.push({
                    productId: item.productId,
                    orderId,
                    movementType: "sale",
                    quantityChange: -item.quantity,
                    stockBefore,
                    stockAfter: stockBefore - item.quantity,
                    note: `Stock deducted for order #${orderId}`,
                    actorId: pending.user_id,
                });
            }
            await this.inventoryService.createMovementsInTransaction(tx, inventoryMovements);
            if (pending.user_id) {
                await this.ordersRepository.markOpenCartCompleteInTransaction(tx, pending.user_id);
            }

            const consumedRows = await this.checkoutReservationRepository.consumeReservation(tx, pending.id);
            if (consumedRows !== 1) {
                throw createCheckoutError("Checkout reservation was already finalized.", HTTP_STATUS.CONFLICT);
            }
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId,
                status: ORDER_STATUS.PENDING,
                note: "Order was placed by the customer.",
                actorId: pending.user_id,
            });
            if (this.orderEmails) {
                await tx.query("UPDATE orders SET contact_snapshot = ? WHERE id = ?", [pending.contact_snapshot ? JSON.stringify(typeof pending.contact_snapshot === "string" ? JSON.parse(pending.contact_snapshot) : pending.contact_snapshot) : null, orderId]);
                await this.orderEmails.emit(tx, orderId, "placed");
                await this.orderEmails.emitPaymentConfirmed(tx, orderId);
            }
            const [order] = await this.ordersRepository.getOrderDateAddedInTransaction(tx, orderId);
            return {
                orderId,
                userId: pending.user_id,
                payableAmount,
                alreadyProcessed: false,
                order: order || { id: orderId, date_added: new Date().toISOString() },
            };
        });

        if (!transactionResult) return null;
        if (transactionResult.alreadyProcessed) return transactionResult.order;
        if (transactionResult.userId) {
            this.notificationsService.notifyOrderPlaced(
                transactionResult.userId,
                transactionResult.orderId,
                transactionResult.payableAmount,
            );
        }
        return transactionResult.order;
    }

    private async finalizePayOSAttemptCheckout(
        orderCode: number,
        paymentLinkId: string,
        paymentAmount: number,
        attemptId: string,
    ): Promise<PayOSAttemptFinalizationResult> {
        const result = await withTransaction(async (tx): Promise<PayOSAttemptFinalizationResult & { userId?: string | null; payableAmount?: number; alreadyProcessed?: boolean }> => {
            const attempt = await this.checkoutReservationRepository.getPayOSAttemptForUpdate(tx, attemptId);
            const review = async (reason: string): Promise<PayOSAttemptFinalizationResult & { userId?: null }> => {
                if (attempt) await this.checkoutReservationRepository.setPaymentAttemptOrderState(tx, attemptId, "REVIEW_REQUIRED");
                return { reviewRequired: true, reason };
            };
            if (!attempt) return { reviewRequired: true, reason: "payment_attempt_missing" };
            const refunded = await this.checkoutReservationRepository.hasPaymentAttemptRefund(tx, attemptId);
            if (refunded || ["REFUND_RECORDED", "RESOLVED"].includes(attempt.resolution_state)) return review("attempt_refunded_or_resolved");
            const expected = Number(attempt.expected_amount_vnd);
            if (attempt.payment_state !== "PAID" || Number(attempt.verified_received_amount_vnd) !== expected
                || String(attempt.provider_order_code) !== String(orderCode)
                || String(attempt.provider_link_id || "") !== String(paymentLinkId)
                || expected !== Number(paymentAmount)) return review("payment_attempt_evidence_mismatch");

            if (attempt.order_state === "CREATED" && attempt.order_id) {
                return { orderId: Number(attempt.order_id), created: false, userId: null, alreadyProcessed: true, payableAmount: 0 };
            }
            if (attempt.cancel_requested_at) return review("cancellation_requested");
            const pending = await this.checkoutReservationRepository.getPendingCheckoutByProviderOrderCodeForUpdate(tx, PAYMENT_PROVIDER.PAYOS, orderCode);
            if (!pending || Number(pending.id) !== Number(attempt.pending_checkout_id)) return review("pending_checkout_missing");
            if (pending.status === CHECKOUT_RESERVATION_STATUS.RELEASED || pending.consumed_at) return review("checkout_cancelled_or_consumed");
            if (pending.status !== CHECKOUT_RESERVATION_STATUS.PENDING && pending.status !== CHECKOUT_RESERVATION_STATUS.EXPIRED) return review("checkout_not_payable");
            if (pending.payment_provider !== PAYMENT_PROVIDER.PAYOS
                || String(pending.provider_order_code) !== String(orderCode)
                || (pending.provider_reference !== null && String(pending.provider_reference) !== String(paymentLinkId))
                || pending.payment_currency !== CURRENCY_CODE.VND
                || Number(pending.payment_amount) !== expected) return review("checkout_payment_identity_mismatch");
            if (pending.provider_reference === null) {
                const boundRows = await this.checkoutReservationRepository.bindPayOSProviderReference(
                    tx, pending.id, orderCode, paymentLinkId, expected,
                );
                if (boundRows !== 1) return review("checkout_payment_identity_mismatch");
            }

            const existingOrder = await this.ordersRepository.findPayOSOrderInTransaction(tx, orderCode, paymentLinkId, paymentAmount);
            if (existingOrder) {
                await this.checkoutReservationRepository.setPaymentAttemptOrderState(tx, attemptId, "CREATED", existingOrder.id);
                return { orderId: existingOrder.id, created: false, userId: pending.user_id, payableAmount: 0, alreadyProcessed: true };
            }

            if (pending.discount_id) {
                const promotionStatus = await this.checkoutReservationRepository.getPromotionReservationStatus(tx, pending.id);
                if (promotionStatus !== "RESERVED" && promotionStatus !== "RELEASED") return review("promotion_reservation_unavailable");
            }
            let authoritativeCart: CartItemRow[];
            try { authoritativeCart = JSON.parse(pending.cart_json) as CartItemRow[]; }
            catch { return review("checkout_snapshot_invalid"); }
            const reservationItems = await this.checkoutReservationRepository.getReservationItems(tx, pending.id);
            if (reservationItems.length === 0) return review("inventory_reservation_missing");
            const productIds = reservationItems.map((item) => item.productId).sort((a, b) => a - b);
            const lockedProducts = await this.checkoutReservationRepository.lockProducts(tx, productIds);
            const available = await this.checkoutReservationRepository.getAvailableQuantitiesForPaidCheckout(tx, pending.id, productIds);
            const availableById = new Map(available.map((item) => [item.productId, item.availableQuantity]));
            const cartItemById = new Map(authoritativeCart.map((item) => [Number(item.product_id || 0), item] as const));
            for (const item of reservationItems) {
                if (availableById.get(item.productId) === undefined || (availableById.get(item.productId) ?? 0) < item.quantity) {
                    await this.checkoutReservationRepository.setPaymentAttemptOrderState(tx, attemptId, "REVIEW_REQUIRED");
                    return { reviewRequired: true, reason: `insufficient_stock:${String(cartItemById.get(item.productId)?.product_name || item.productId)}` };
                }
            }
            await this.checkoutReservationRepository.setPaymentAttemptOrderState(tx, attemptId, "FINALIZING");
            const orderResult = await this.ordersRepository.insertOrderInTransaction(tx, {
                userId: pending.user_id, guestEmail: pending.guest_email, guestName: pending.guest_name,
                guestPhone: pending.guest_phone, guestOrderTokenHash: pending.guest_order_token_hash,
                totalPrice: Number(pending.total_price), discount: Number(pending.discount) + Number(pending.loyalty_discount || 0),
                shippingAddress: pending.shipping_address, paymentMethod: PAYMENT_PROVIDER.PAYOS, currency: env.storeCurrency,
            });
            const orderId = orderResult.insertId;
            if (pending.discount_id) {
                const consumedRows = await this.promotionsRepository.consumePaidPromotionReservation(tx, pending.id, orderId);
                if (consumedRows !== 1) throw createCheckoutError("Promotion reservation was already finalized.", HTTP_STATUS.CONFLICT);
            }
            const loyaltyPointsRedeemed = Number(pending.loyalty_points_redeemed) || 0;
            const loyaltyDiscount = Number(pending.loyalty_discount) || 0;
            const payableAmount = Math.max(Number(pending.total_price) - Number(pending.discount) - loyaltyDiscount, 0);
            await tx.query("UPDATE orders SET loyalty_points_redeemed = ?, loyalty_discount = ?, pricing_snapshot = ?, delivery_snapshot = ?, contact_snapshot = ? WHERE id = ?", [
                loyaltyPointsRedeemed,
                loyaltyDiscount,
                pending.pricing_snapshot ? JSON.stringify(typeof pending.pricing_snapshot === "string" ? JSON.parse(pending.pricing_snapshot) : pending.pricing_snapshot) : null,
                pending.delivery_snapshot ? JSON.stringify(typeof pending.delivery_snapshot === "string" ? JSON.parse(pending.delivery_snapshot) : pending.delivery_snapshot) : null,
                pending.contact_snapshot ? JSON.stringify(typeof pending.contact_snapshot === "string" ? JSON.parse(pending.contact_snapshot) : pending.contact_snapshot) : null,
                orderId,
            ]);
            await this.createPaymentLedgerInTransaction(tx, {
                orderId, paymentMethod: PAYMENT_PROVIDER.PAYOS, baseAmount: payableAmount,
                providerPaymentId: paymentLinkId, providerReference: String(orderCode),
                paymentQuote: { baseAmount: Number(payableAmount.toFixed(2)), baseCurrency: CURRENCY_CODE.VND, amount: expected, currency: CURRENCY_CODE.VND, fxRate: Number(pending.payment_fx_rate) || 1 },
                status: PAYMENT_STATUS.PAID,
            });
            await this.shippingRepository.initializeOrderShipment(tx, orderId);
            if (this.loyaltyService) await this.loyaltyService.awardPaidOrder(tx, orderId);
            const attributes = await this.productAttributesRepository.getForProducts(tx, productIds);
            const itemSnapshots = authoritativeCart.map((item) => buildOrderItemSnapshot(item, attributes.get(Number(item.product_id || 0))));
            const orderItems = itemSnapshots.map((snapshot) => [orderId, snapshot.productId, snapshot.quantity, snapshot.unitPrice * snapshot.quantity,
                snapshot.sku, snapshot.productName, snapshot.image, snapshot.unitPrice, snapshot.brand, snapshot.category,
                snapshot.warrantyMonths, JSON.stringify(snapshot.specifications)]);
            if (orderItems.length) await this.ordersRepository.insertOrderItemsInTransaction(tx, orderItems);
            const stocks = new Map(lockedProducts.map((product) => [product.id, Number(product.stock) || 0]));
            const movements: InventoryMovementInput[] = [];
            for (const item of reservationItems) {
                const stockBefore = stocks.get(item.productId) || 0;
                const updated = await this.ordersRepository.decrementProductStockInTransaction(tx, item.productId, item.quantity);
                if (updated.affectedRows !== 1) throw createCheckoutError("Stock changed while confirming payment.", HTTP_STATUS.CONFLICT);
                movements.push({ productId: item.productId, orderId, movementType: "sale", quantityChange: -item.quantity,
                    stockBefore, stockAfter: stockBefore - item.quantity, note: `Stock deducted for order #${orderId}`, actorId: pending.user_id });
            }
            await this.inventoryService.createMovementsInTransaction(tx, movements);
            if (pending.user_id) await this.ordersRepository.markOpenCartCompleteInTransaction(tx, pending.user_id);
            if (await this.checkoutReservationRepository.consumePaidReservation(tx, pending.id) !== 1) throw createCheckoutError("Checkout reservation was already finalized.", HTTP_STATUS.CONFLICT);
            await this.orderTimelineService.createTimelineEventInTransaction(tx, { orderId, status: ORDER_STATUS.PENDING, note: "Order was placed by the customer.", actorId: pending.user_id });
            if (this.orderEmails) await this.orderEmails.emit(tx, orderId, "placed");
            await this.checkoutReservationRepository.setPaymentAttemptOrderState(tx, attemptId, "CREATED", orderId);
            return { orderId, created: true, userId: pending.user_id, payableAmount, alreadyProcessed: false };
        });
        if ("reviewRequired" in result) return result;
        if (result.created && result.userId) this.notificationsService.notifyOrderPlaced(result.userId, result.orderId, result.payableAmount || 0);
        return { orderId: result.orderId, created: result.created };
    }

    getOrders(): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrders((err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersPaginated(limit: number, offset: number, filters: { search?: string; status?: number; paymentMethod?: string; sort?: "newest" | "oldest" }): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersPaginated(limit, offset, filters, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getAdminPendingQueue(): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getAdminPendingQueue((err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersCount(filters: { search?: string; status?: number; paymentMethod?: string }): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersCount(filters, (err: Error | null, results: Array<{ total: number }>) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
            });
        });
    }

    getOrdersAdminSummary(): Promise<{ total: number; pending: number; completed: number; canceled: number; historicalPaymentMethods: number; revenue: number }> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersAdminSummary((err: Error | null, results: Array<Record<string, number | string>>) => {
                if (err) return reject(err);
                const row = results?.[0] || {};
                resolve({
                    total: Number(row.total) || 0,
                    pending: Number(row.pending) || 0,
                    completed: Number(row.completed) || 0,
                    canceled: Number(row.canceled) || 0,
                    historicalPaymentMethods: Number(row.historicalPaymentMethods) || 0,
                    revenue: Number(row.revenue) || 0,
                });
            });
        });
    }

    getOrdersByUserId(uid: string): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersByUserId(uid, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderDetail(orderId: number): Promise<(OrderDetail & { timeline?: unknown }) | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderDetail(orderId, (err: Error | null, results: OrderDetailRow[]) => {
                if (err) return reject(err);
                if (results.length === 0) return resolve(null);

                const first = results[0];
                const order: OrderDetail = {
                    id: first.id,
                    date_added: first.date_added,
                    delivered_at: first.delivered_at || null,
                    return_eligible_until: first.delivered_at ? getReturnDeadline(first.delivered_at) : null,
                    user_id: first.user_id,
                    guest_email: first.guest_email || null,
                    guest_name: first.guest_name || null,
                    guest_phone: first.guest_phone || null,
                    customer_name: first.customer_name,
                    customer_email: first.customer_email,
                    status: first.status,
                    total_price: Number(first.total_price) || 0,
                    discount: Number(first.discount) || 0,
                    shipping_address: first.shipping_address,
                    payment_method: first.payment_method,
                    currency: first.currency || CURRENCY_CODE.USD,
                    payment_status: first.payment_status || null,
                    payment_amount: first.payment_amount === null || first.payment_amount === undefined ? null : Number(first.payment_amount),
                    payment_currency: first.payment_currency || null,
                    payment_simulated: first.payment_simulated === null || first.payment_simulated === undefined ? null : Boolean(first.payment_simulated),
                    items: results
                        .filter((row) => row.product_id)
                        .map((row) => ({
                            id: row.order_item_id,
                            productId: row.product_id,
                            sku: row.sku,
                            productName: row.product_name,
                            category: row.category,
                            brand: row.brand,
                            warrantyMonths: row.warranty_months === null || row.warranty_months === undefined
                                ? null
                                : Number(row.warranty_months),
                            specifications: row.specifications,
                            price: Number(row.price) || 0,
                            sale_price: row.sale_price === null ? null : Number(row.sale_price) || null,
                            stock: Number(row.stock) || 0,
                            main_image: row.main_image,
                            quantity: Number(row.quantity) || 0,
                            totalPrice: Number(row.item_total_price) || 0,
                        })),
                };

                this.orderTimelineService
                    .getTimeline(orderId, order)
                    .then((timeline: OrderTimelineRow[]) => resolve({ ...order, timeline }))
                    .catch(reject);
            });
        });
    }

    changeOrderStatus(
        orderId: number,
        status: number,
        actorId: string | number | null = null,
    ): Promise<OrderSummaryRow> {
        if (Number(status) === ORDER_STATUS.CANCELED) {
            return this.cancelOrder(orderId, String(actorId || "admin"), true);
        }
        if (Number(status) !== ORDER_STATUS.DONE) {
            return Promise.reject(createCheckoutError("Only pending orders can transition to Done", HTTP_STATUS.CONFLICT));
        }

        return withTransaction(async (tx) => {
            const current = await this.ordersRepository.getOrderLifecycleForUpdate(tx, orderId);
            if (!current) throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
            const changed = await completeDeliveredOrder(tx, orderId, new Date(), actorId == null ? null : String(actorId));
            if (changed && this.loyaltyService) await this.loyaltyService.awardPaidOrder(tx, orderId);
            if (changed && this.orderEmails) await this.orderEmails.emitPaymentConfirmed(tx, orderId);
            return { userId: current.user_id, changed };
        }).then(async (result) => {
            if (result.changed && result.userId) this.notificationsService.notifyOrderStatus(result.userId, orderId, ORDER_STATUS.DONE);
            return this.getOrderSummary(orderId);
        });
    }

    getOrderItems(): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItems((err: Error | null, results: unknown[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderItemsPaginated(limit: number, offset: number): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItemsPaginated(limit, offset, (err: Error | null, results: unknown[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderItemsCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItemsCount((err: Error | null, results: Array<{ total: number }>) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
            });
        });
    }

    applyDiscount(discountCode: string, userId?: string): Promise<PromotionRow | null> {
        return this.promotionsRepository.getActivePromotionByCodeForCheckout(discountCode, userId);
    }

    getOrderByPayOSOrderCode(orderCode: number): Promise<OrderBySessionRow | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderByPayOSOrderCode(orderCode, (err: Error | null, results: OrderBySessionRow[]) => {
                if (err) return reject(err);
                resolve(results[0] || null);
            });
        });
    }
}
