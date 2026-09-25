import { Injectable, Optional } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { CHECKOUT_RESERVATION_STATUS } from "#src/shared/constants/checkout-reservation";
import { CURRENCY_CODE } from "#src/shared/constants/currency";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { InsertResult } from "#src/shared/interfaces/domain";
import type { CartItemRow, CartValidationIssue } from "../cart/cart.types";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import type { GuestOrderIdentityRow, GuestSafeOrderDetail, OrderBySessionRow, OrderDetail, OrderDetailRow, OrderIdentity, OrderItemSnapshot, OrderSummaryRow, OrderTimelineRow, LockedProductRow, PendingCheckoutRow } from "./orders.types";
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
import { attributeMapToSnapshot, type ProductAttribute } from "../products/product-attributes.types";
import { PaymentProviderService } from "../payments/payment-provider.service";
import { buildPaymentQuote } from "../payments/currency";
import { PAYMENT_PROVIDER, PAYMENT_STATUS, PAYMENT_RECONCILIATION_STATUS, PAYMENT_PROVIDER_STATUS, type PaymentProviderName, type PaymentQuote } from "../payments/payment.types";
import { generateGuestOrderToken, hashGuestOrderToken, matchesGuestOrderToken } from "./guest-order-token";
import { ProductAlertsService } from "../product-alerts/product-alerts.service";
import { getProductAlertTransitions } from "../product-alerts/product-alerts.policy";

export const createCheckoutError = (message: string, statusCode: number = HTTP_STATUS.CONFLICT, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });

const parseSpecificationsSnapshot = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return { raw: value };
        }
        return { raw: value };
    }

    return {};
};

const buildOrderItemSnapshot = (product: CartItemRow, currentAttributes?: ProductAttribute[]): OrderItemSnapshot => {
    const productId = Number(product.product_id || 0);
    const quantity = Number(product.quantity) || 0;
    const unitPrice = product.sale_price !== null && product.sale_price !== undefined
        ? Number(product.sale_price)
        : Number(product.price) || 0;

    const structuredAttributes = attributeMapToSnapshot(currentAttributes);

    return {
        productId,
        sku: String(product.sku || `DIG-${String(productId).padStart(8, "0")}`).trim(),
        productName: String(product.product_name || `Product #${productId}`),
        image: product.main_image ? String(product.main_image) : null,
        unitPrice,
        brand: String(product.brand || ""),
        category: String(product.category || ""),
        warrantyMonths: product.warranty_months === null || product.warranty_months === undefined
            ? null
            : Number(product.warranty_months),
        specifications: Object.keys(structuredAttributes).length > 0
            ? structuredAttributes
            : parseSpecificationsSnapshot(product.specifications),
        quantity,
    };
};

const normalizePaymentProvider = (paymentMethod: string): PaymentProviderName => paymentMethod as PaymentProviderName;

const roundCurrency = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeSalePrice = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
};

type CreateOrderFromCartInputBase = {
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
        @Optional() private readonly paymentProviderService?: PaymentProviderService,
        @Optional() private readonly productAlertsService?: ProductAlertsService,
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

        await tx.query(
            `INSERT INTO order_payments
                (order_id, provider, status, provider_reference, provider_payment_id, idempotency_key,
                 base_amount, base_currency, amount, currency, fx_rate, paid_at, simulated, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${paymentStatus === PAYMENT_STATUS.PAID ? "UTC_TIMESTAMP()" : "NULL"}, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE updated_at = UTC_TIMESTAMP()`,
            [
                orderId,
                provider,
                paymentStatus,
                providerResult?.providerReference || providerReference || providerPaymentId,
                providerPaymentId,
                `order:${orderId}:payment`,
                quote.baseAmount,
                quote.baseCurrency,
                quote.amount,
                quote.currency,
                quote.fxRate,
                providerResult?.simulated ? 1 : 0,
            ],
        );
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
        const result = await withTransaction(async (tx) => {
            const [order] = await tx.query<Array<{ user_id: string; status: number; inventory_restored_at: Date | null }>>(
                "SELECT user_id, status, inventory_restored_at FROM orders WHERE id = ? FOR UPDATE",
                [orderId],
            );
            if (!order) throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
            if (!admin && String(order.user_id) !== String(actorId)) throw createCheckoutError("You cannot cancel this order", HTTP_STATUS.FORBIDDEN);
            if (Number(order.status) === ORDER_STATUS.CANCELED) return { userId: order.user_id, changed: false };
            if (Number(order.status) !== ORDER_STATUS.PENDING) throw createCheckoutError("Only pending orders can be canceled", HTTP_STATUS.CONFLICT);
            if (!order.inventory_restored_at) {
                const items = await tx.query<Array<{ product_id: number; quantity: number }>>(
                    "SELECT product_id, quantity FROM order_items WHERE order_id = ? ORDER BY product_id FOR UPDATE", [orderId],
                );
                const movements: InventoryMovementInput[] = [];
                for (const item of items) {
                    const [product] = await tx.query<Array<{ id: number; price: number; sale_price: number | null; stock: number }>>(
                        "SELECT id, price, sale_price, stock FROM products WHERE id = ? FOR UPDATE", [item.product_id],
                    );
                    if (!product) throw createCheckoutError("Product for this order no longer exists", HTTP_STATUS.CONFLICT);
                    const quantity = Number(item.quantity) || 0;
                    const stockUpdate = await tx.query<{ affectedRows: number }>(
                        "UPDATE products SET stock = stock + ? WHERE id = ?",
                        [quantity, item.product_id],
                    );
                    if (stockUpdate.affectedRows !== 1) {
                        throw createCheckoutError("Product stock could not be restored", HTTP_STATUS.CONFLICT);
                    }
                    if (this.productAlertsService) {
                        const transitions = getProductAlertTransitions(
                            {
                                productId: item.product_id,
                                price: Number(product.price),
                                salePrice: product.sale_price === null || product.sale_price === undefined ? null : Number(product.sale_price),
                                stock: Number(product.stock),
                            },
                            {
                                productId: item.product_id,
                                price: Number(product.price),
                                salePrice: product.sale_price === null || product.sale_price === undefined ? null : Number(product.sale_price),
                                stock: Number(product.stock) + quantity,
                            },
                        );
                        if (transitions.length > 0) {
                            await this.productAlertsService.recordTransitionsInTransaction(tx, transitions);
                        }
                    }
                    movements.push({ productId: item.product_id, orderId, movementType: "restock_cancelled_order", quantityChange: quantity,
                        stockBefore: Number(product.stock), stockAfter: Number(product.stock) + quantity,
                        note: `Stock restored for canceled order #${orderId}`, actorId });
                }
                if (movements.length > 0) await this.inventoryService.createMovementsInTransaction(tx, movements);
            }
            await tx.query(
                `UPDATE orders
                 SET status = ${ORDER_STATUS.CANCELED}, inventory_restored_at = COALESCE(inventory_restored_at, UTC_TIMESTAMP()), cancellation_reason = ?
                 WHERE id = ? AND status = ${ORDER_STATUS.PENDING}`,
                [reason || null, orderId],
            );
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId, status: ORDER_STATUS.CANCELED, note: reason ? `Order canceled: ${reason}` : "Order was canceled.", actorId,
            });
            return { userId: order.user_id, changed: true };
        });
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
            return {
                cart: authoritativeCart,
                merchandiseTotal: authoritativeTotalPrice,
                lockedProducts: null,
            };
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
            guestQuote,
        }: {
            identity: OrderIdentity;
            transactionCart: CartItemRow[];
            transactionMerchandiseTotal: number;
            requestedDiscount: number;
            shippingAddress: string;
            paymentMethod: PaymentProviderName;
            discountCode?: string;
            guestQuote?: CreateOrderFromCartInputBase["guestQuote"];
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

        await this.createPaymentLedgerInTransaction(tx, {
            orderId,
            paymentMethod,
            baseAmount: Math.max(transactionMerchandiseTotal - appliedDiscount, 0),
        });

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
                shippingAddress,
                paymentMethod,
                discountCode,
                guestQuote,
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
        { totalPrice, cart, discount, discountCode, shippingAddress, paymentMethod }: PurchasePayload,
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
            authoritativeCart: checkoutValidation.cartItems,
            authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            discount,
            discountCode,
            shippingAddress,
            paymentMethod,
        });
    }

    async makeGuestPurchase(payload: GuestPurchasePayload): Promise<{
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

    async finalizePayOSCheckout(
        orderCode: number,
        paymentLinkId: string,
        paymentAmount: number,
    ): Promise<{ id: number; date_added: string } | null> {
        const transactionResult = await withTransaction(async (tx) => {
            const pending = await this.checkoutReservationRepository.getPendingCheckoutByProviderOrderCodeForUpdate(tx, PAYMENT_PROVIDER.PAYOS, orderCode);
            const [existingOrder] = await tx.query<Array<{ id: number; date_added: string }>>(
                `SELECT o.id, DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                 FROM orders o
                 JOIN order_payments op ON op.order_id = o.id
                 WHERE op.provider = '${PAYMENT_PROVIDER.PAYOS}' AND op.provider_reference = ?
                   AND op.provider_payment_id = ? AND op.amount = ? AND op.currency = '${CURRENCY_CODE.VND}'
                 LIMIT 1`,
                [String(orderCode), String(paymentLinkId), Number(paymentAmount)],
            );
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

            const orderResult = await tx.query<InsertResult>(
                `INSERT INTO orders
                    (user_id, guest_email, guest_name, guest_phone, guest_order_token_hash,
                     total_price, discount, shipping_address, payment_method, currency, date_added)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
                [
                    pending.user_id,
                    pending.guest_email,
                    pending.guest_name,
                    pending.guest_phone,
                    pending.guest_order_token_hash,
                    Number(pending.total_price),
                    Number(pending.discount),
                    pending.shipping_address,
                    PAYMENT_PROVIDER.PAYOS,
                    env.storeCurrency,
                ],
            );
            const orderId = orderResult.insertId;
            if (pending.discount_id) {
                const consumedRows = await this.promotionsRepository.consumePromotionReservation(tx, pending.id, orderId);
                if (consumedRows !== 1) {
                    throw createCheckoutError("Promotion reservation was already finalized.", HTTP_STATUS.CONFLICT);
                }
            }

            const payableAmount = Math.max(Number(pending.total_price) - Number(pending.discount), 0);
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
                await tx.query(
                    `INSERT INTO order_items
                        (order_id, product_id, quantity, total_price, sku_snapshot, product_name_snapshot,
                         image_snapshot, unit_price_snapshot, brand_snapshot, category_snapshot,
                         warranty_months_snapshot, specifications_snapshot)
                     VALUES ?`,
                    [orderItemsValues],
                );
            }

            const inventoryMovements: InventoryMovementInput[] = [];
            for (const item of reservationItems) {
                const stockBefore = stockById.get(item.productId) || 0;
                const result = await tx.query<{ affectedRows: number }>(
                    "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
                    [item.quantity, item.productId, item.quantity],
                );
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
                await tx.query("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [pending.user_id]);
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
            const [order] = await tx.query<Array<{ id: number; date_added: string }>>(
                `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                 FROM orders WHERE id = ?`,
                [orderId],
            );
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

    getOrders(): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrders((err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersPaginated(limit: number, offset: number): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersPaginated(limit, offset, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersCount((err: Error | null, results: Array<{ total: number }>) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
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
            const [current] = await tx.query<Array<{ user_id: string; status: number; delivered_at?: string | Date | null }>>(
                "SELECT user_id, status, delivered_at FROM orders WHERE id = ? FOR UPDATE",
                [orderId],
            );
            if (!current) throw createCheckoutError("Order not found", HTTP_STATUS.NOT_FOUND);
            const [payment] = await tx.query<Array<{ id: number; provider: string; status: string; simulated?: number | boolean | null }>>(
                "SELECT id, provider, status, simulated FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE",
                [orderId],
            );
            if (payment?.provider === PAYMENT_PROVIDER.PAYOS && Boolean(payment.simulated)) {
                throw createCheckoutError("Simulated PayOS payments cannot be marked delivered", HTTP_STATUS.CONFLICT);
            }
            if (Number(current.status) === ORDER_STATUS.DONE) {
                if (!current.delivered_at) {
                    await tx.query("UPDATE orders SET delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ?", [orderId]);
                }
                return { userId: current.user_id, changed: false };
            }
            if (Number(current.status) !== ORDER_STATUS.PENDING) {
                throw createCheckoutError("Canceled orders cannot transition to Done", HTTP_STATUS.CONFLICT);
            }
            if (payment?.provider === PAYMENT_PROVIDER.PAYOS && payment.status !== PAYMENT_STATUS.PAID) {
                throw createCheckoutError("PayOS payment must be paid before delivery", HTTP_STATUS.CONFLICT);
            }
            await tx.query(
                `UPDATE orders SET status = ${ORDER_STATUS.DONE}, delivered_at = COALESCE(delivered_at, UTC_TIMESTAMP()) WHERE id = ? AND status = ${ORDER_STATUS.PENDING}`,
                [orderId],
            );
            if (payment?.provider === PAYMENT_PROVIDER.CASH && payment.status === PAYMENT_STATUS.PENDING) {
                await tx.query(
                    `UPDATE order_payments SET status = '${PAYMENT_STATUS.PAID}', paid_at = COALESCE(paid_at, UTC_TIMESTAMP()), reconciliation_status = '${PAYMENT_RECONCILIATION_STATUS.MANUAL_CONFIRMED}', last_reconciled_at = UTC_TIMESTAMP(), provider_status = '${PAYMENT_PROVIDER_STATUS.CASH_COLLECTED}', updated_at = UTC_TIMESTAMP() WHERE id = ? AND provider = '${PAYMENT_PROVIDER.CASH}' AND status = '${PAYMENT_STATUS.PENDING}'`,
                    [payment.id],
                );
            }
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId,
                status: ORDER_STATUS.DONE,
                note: "Order was completed by an admin.",
                actorId,
            });
            return { userId: current.user_id, changed: true };
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

    applyDiscount(discountCode: string): Promise<PromotionRow | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.applyDiscount(discountCode, (err: Error | null, results: PromotionRow[]) => {
                if (err) return reject(err);
                if (results.length === 0) {
                    resolve(null);
                    return;
                }
                resolve(results[0]);
            });
        });
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
