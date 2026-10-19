import { Injectable, Optional } from "@nestjs/common";
import { OrderEmailService } from "./order-email.service";
import { ShippingQuoteService } from "../shipping/shipping-quote.service";
import { randomUUID } from "node:crypto";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { PAYMENT_PROVIDER } from "../payments/payment.types";
import { CHECKOUT_RESERVATION_WINDOW_MS } from "#src/shared/constants/checkout-reservation";
import { withTransaction } from "../database/transaction";
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { PromotionsRepository } from "../promotions/promotions.repository";
import { PaymentAttemptService } from "../payments/payment-attempt.service";
import { TasksService } from "../operations/tasks.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import type { PaymentAttemptClaim, PaymentAttemptDisplaySnapshot, PaymentAttemptOwner } from "../payments/payment-attempt.types";
import type { CartItemRow } from "../cart/cart.types";
import type {
    CheckoutReservation,
    CheckoutReservationInput,
    CheckoutReservationItem,
    OrderIdentity,
    PaymentProviderAttachment,
} from "./orders.types";

type ReservationError = Error & {
    statusCode?: number;
    details?: Record<string, unknown>;
};

export const createReservationError = (
    message: string,
    statusCode: number = HTTP_STATUS.CONFLICT,
    details: Record<string, unknown> = {},
): ReservationError => Object.assign(new Error(message), { statusCode, details });

type ReservationCartItem = CartItemRow & {
    productId?: number;
};

export type PayOSAttemptReservationInput = {
    owner: PaymentAttemptOwner;
    idempotencyKey: string;
    request: unknown;
};

export type PayOSCheckoutReservation = CheckoutReservation & { paymentAttempt: PaymentAttemptClaim };

export class ExistingPayOSAttemptReplayError extends Error {
    constructor(readonly paymentAttempt: PaymentAttemptClaim) {
        super("PayOS checkout attempt already exists");
        this.name = "ExistingPayOSAttemptReplayError";
    }
}

const getProductId = (item: ReservationCartItem): number => Number(item.product_id ?? item.productId ?? 0);

const getQuantity = (item: ReservationCartItem): number => Number(item.quantity ?? 0);

@Injectable()
export class CheckoutReservationService {
    constructor(
        private readonly repository: CheckoutReservationRepository,
        private readonly promotionsRepository: PromotionsRepository,
        private readonly shippingQuoteService: ShippingQuoteService,
        @Optional() private readonly orderEmails?: OrderEmailService,
        @Optional() private readonly paymentAttemptService?: PaymentAttemptService,
        @Optional() private readonly tasks?: TasksService,
        @Optional() private readonly loyaltyService?: LoyaltyService,
    ) {}

    async reserveInventory(input: CheckoutReservationInput): Promise<CheckoutReservation> {
        return (await this.reserveInventoryInternal(input)).reservation;
    }

    async reservePayOSInventory(input: CheckoutReservationInput, attemptInput: PayOSAttemptReservationInput): Promise<PayOSCheckoutReservation> {
        const result = await this.reserveInventoryInternal(input, attemptInput);
        if (!result.paymentAttempt) throw new Error("PayOS payment attempt was not created");
        return { ...result.reservation, paymentAttempt: result.paymentAttempt };
    }

    private async reserveInventoryInternal(
        input: CheckoutReservationInput,
        attemptInput?: PayOSAttemptReservationInput,
    ): Promise<{ reservation: CheckoutReservation; paymentAttempt?: PaymentAttemptClaim }> {
        const aggregatedItems = this.aggregateItems(input.authoritativeCart);
        if (aggregatedItems.length === 0) {
            throw createReservationError("Cart cannot be empty", HTTP_STATUS.BAD_REQUEST);
        }

        const expiresAt = input.databaseExpiresAt ?? new Date(Date.now() + CHECKOUT_RESERVATION_WINDOW_MS);
        if (expiresAt.getTime() <= Date.now()) {
            throw createReservationError("Checkout reservation expiry must be in the future", HTTP_STATUS.BAD_REQUEST);
        }

        const reservationToken = randomUUID();
        const identity = this.resolveIdentity(input);
        return withTransaction(async (tx) => {
            const productIds = aggregatedItems.map((item) => item.productId).sort((a, b) => a - b);
            const lockedProducts = await this.repository.lockProducts(tx, productIds);
            if (attemptInput) {
                if (!this.paymentAttemptService) throw new Error("Payment attempt persistence is not configured");
                const existingAttempt = await this.paymentAttemptService.findExistingClaim({
                    owner: attemptInput.owner,
                    idempotencyKey: attemptInput.idempotencyKey,
                    request: attemptInput.request,
                }, tx);
                if (existingAttempt) throw new ExistingPayOSAttemptReplayError(existingAttempt);
            }
            const lockedProductsById = new Map(lockedProducts.map((product) => [Number(product.id), product]));
            let lockedSubtotal = 0;
            for (const item of input.authoritativeCart) {
                const productId = getProductId(item as ReservationCartItem);
                const quantity = getQuantity(item as ReservationCartItem);
                const product = lockedProductsById.get(productId);
                const catalogPrice = Number(product?.price);
                const catalogSalePriceValue = product?.sale_price == null ? null : Number(product.sale_price);
                const catalogSalePrice = catalogSalePriceValue !== null && Number.isFinite(catalogSalePriceValue) && catalogSalePriceValue >= 0
                    ? catalogSalePriceValue
                    : null;
                const cartPrice = Number(item.price);
                const cartSalePrice = item.sale_price == null ? null : Number(item.sale_price);
                if (!product || !Number.isFinite(catalogPrice) || catalogPrice !== cartPrice
                    || catalogSalePrice !== cartSalePrice || !Number.isSafeInteger(quantity) || quantity <= 0) {
                    throw createReservationError("Product price changed. Refresh your cart and delivery quote.");
                }
                lockedSubtotal += (catalogSalePrice ?? catalogPrice) * quantity;
            }
            if (!Number.isSafeInteger(Math.round(lockedSubtotal + Number.EPSILON)) || Math.round(lockedSubtotal + Number.EPSILON) !== input.authoritativeTotalPrice) {
                throw createReservationError("Cart total changed. Refresh your cart and delivery quote.");
            }
            const activeReservations = await this.repository.getActiveReservationQuantities(tx, productIds);
            const stockByProductId = new Map(lockedProducts.map((product) => [product.id, Number(product.stock) || 0]));
            const reservedByProductId = new Map(
                activeReservations.map((row) => [row.product_id, Number(row.reserved_quantity) || 0]),
            );

            for (const item of aggregatedItems) {
                const stock = stockByProductId.get(item.productId);
                const reserved = reservedByProductId.get(item.productId) ?? 0;
                const available = Math.max((stock ?? 0) - reserved, 0);
                if (stock == null || available < item.quantity) {
                    const product = lockedProducts.find((candidate) => candidate.id === item.productId);
                    const productName = product?.name || `Product #${item.productId}`;
                    throw createReservationError(
                        `${productName} only has ${available} item(s) available. Update your cart and try again.`,
                        409,
                        {
                            productId: item.productId,
                            requestedQuantity: item.quantity,
                            availableStock: available,
                        },
                    );
                }
            }

            const pendingCheckout = await this.repository.insertPendingCheckout(tx, {
                reservationToken,
                userId: identity.userId,
                guestEmail: identity.kind === "guest" ? identity.guestContact.guestEmail : null,
                guestName: identity.kind === "guest" ? identity.guestContact.guestName : null,
                guestPhone: identity.kind === "guest" ? identity.guestContact.guestPhone ?? null : null,
                guestOrderTokenHash: identity.kind === "guest" ? identity.guestOrderTokenHash : null,
                cartJson: JSON.stringify(input.authoritativeCart),
                totalPrice: input.authoritativeTotalPrice,
                discount: input.discountCode ? input.discount : 0,
                loyaltyPointsRedeemed: input.loyaltyPoints ?? 0,
                shippingAddress: input.shippingAddress,
                expiresAt,
            });
            await this.repository.insertInventoryReservations(tx, pendingCheckout.insertId, aggregatedItems);

            let appliedDiscount = 0;
            if (input.discountCode) {
                const promotion = await this.promotionsRepository.reservePromotion(
                    tx,
                    input.discountCode,
                    pendingCheckout.insertId,
                    identity.userId,
                    expiresAt,
                    input.authoritativeTotalPrice,
                );
                appliedDiscount = promotion.discount;
            }

            if (!input.deliveryCheckout || !this.shippingQuoteService) throw createReservationError("A delivery quote is required");
            const delivery = await this.shippingQuoteService.validateQuote(tx, input.deliveryCheckout, input.authoritativeCart, input.authoritativeTotalPrice, appliedDiscount);
            const requestedPoints = input.loyaltyPoints ?? 0;
            const loyaltyDiscount = requestedPoints > 0
                ? await this.loyaltyService?.holdCheckoutPoints(
                    tx,
                    identity.userId,
                    pendingCheckout.insertId,
                    requestedPoints,
                    delivery.pricing.itemsSubtotal,
                    delivery.pricing.merchandiseDiscount,
                )
                : 0;
            if (requestedPoints > 0 && loyaltyDiscount === undefined) throw new Error("Loyalty point checkout is not configured");
            const pointsDiscount = Number(loyaltyDiscount) || 0;
            const pricingSnapshot = {
                ...delivery.pricing,
                promotionDiscount: delivery.pricing.merchandiseDiscount,
                loyaltyDiscount: pointsDiscount,
                loyaltyPointsRedeemed: requestedPoints,
                merchandiseDiscount: delivery.pricing.merchandiseDiscount + pointsDiscount,
                payableTotal: delivery.pricing.payableTotal - pointsDiscount,
            };
            if (this.orderEmails) await this.orderEmails.snapshotPending(tx, pendingCheckout.insertId, identity, input.deliveryCheckout.locale);
            await tx.query("UPDATE pending_checkouts SET total_price = ?, discount = ?, loyalty_discount = ?, pricing_snapshot = ?, delivery_snapshot = ?, shipping_address = ? WHERE id = ?", [delivery.pricing.itemsSubtotal + delivery.pricing.shippingFee, delivery.pricing.merchandiseDiscount, pointsDiscount, JSON.stringify(pricingSnapshot), JSON.stringify(delivery.delivery), JSON.stringify(delivery.delivery.address), pendingCheckout.insertId]);
            let paymentAttempt: PaymentAttemptClaim | undefined;
            if (attemptInput) {
                if (!this.paymentAttemptService) throw new Error("Payment attempt persistence is not configured");
                const snapshot: PaymentAttemptDisplaySnapshot = {
                    items: input.authoritativeCart.map((item) => ({
                        productId: getProductId(item as ReservationCartItem),
                        name: String(item.product_name ?? `Product #${getProductId(item as ReservationCartItem)}`),
                        quantity: getQuantity(item as ReservationCartItem),
                        unitPriceVnd: Number(item.sale_price !== null && item.sale_price !== undefined && Number(item.sale_price) >= 0 ? item.sale_price : item.price),
                    })),
                    subtotalVnd: delivery.pricing.itemsSubtotal,
                    discountVnd: pricingSnapshot.merchandiseDiscount,
                    shippingVnd: delivery.pricing.shippingFee,
                    delivery: { method: delivery.delivery.provider },
                };
                paymentAttempt = await this.paymentAttemptService.claim({
                    owner: attemptInput.owner,
                    idempotencyKey: attemptInput.idempotencyKey,
                    request: attemptInput.request,
                    snapshot,
                    pendingCheckoutId: pendingCheckout.insertId,
                    expectedAmountVnd: pricingSnapshot.payableTotal,
                    expiresAt,
                }, tx);
                if (paymentAttempt.replayed) throw new ExistingPayOSAttemptReplayError(paymentAttempt);
                const orderCode = Number(paymentAttempt.providerOrderCode);
                if (!Number.isSafeInteger(orderCode) || orderCode <= 0) throw new Error("Invalid persisted PayOS order code");
                const affectedRows = await this.repository.assignPayOSAttempt(tx, pendingCheckout.insertId, orderCode, paymentAttempt.expectedAmountVnd);
                if (affectedRows !== 1) throw createReservationError("Checkout reservation is no longer available.", HTTP_STATUS.CONFLICT);
                if (!this.tasks) throw new Error("PayOS recovery task persistence is not configured");
                await this.tasks.enqueue(tx, {
                    kind: "PAYOS_RECONCILE",
                    key: `payos:${paymentAttempt.id}:0`,
                    payload: {
                        attemptId: paymentAttempt.id,
                        pendingCheckoutId: pendingCheckout.insertId,
                        providerOrderCode: paymentAttempt.providerOrderCode,
                        generation: 0,
                        expiresAt: expiresAt.toISOString(),
                    },
                    dueAt: new Date(Date.now() + 15000),
                });
            }
            const reservation: CheckoutReservation = {
                pendingCheckoutId: pendingCheckout.insertId,
                reservationToken,
                expiresAt,
                cartSnapshot: input.authoritativeCart,
                pricingSnapshot: {
                    totalPrice: delivery.pricing.itemsSubtotal + delivery.pricing.shippingFee,
                    discount: pricingSnapshot.merchandiseDiscount,
                },
                shippingAddress: input.shippingAddress,
                items: aggregatedItems,
            };
            return { reservation, paymentAttempt };
        });
    }

    async releaseReservation(reservationToken: string, reason: string): Promise<void> {
        await withTransaction(async (tx) => {
            const pendingCheckout = await this.repository.getPendingCheckoutByTokenForUpdate(tx, reservationToken);
            await this.repository.releaseReservation(tx, reservationToken, reason);
            if (pendingCheckout?.discount_id) {
                await this.promotionsRepository.releasePromotionReservation(tx, pendingCheckout.id);
            }
            if (pendingCheckout && this.loyaltyService) await this.loyaltyService.releaseCheckoutPoints(tx, pendingCheckout.id);
        });
    }


    async attachPaymentProvider(reservationToken: string, attachment: PaymentProviderAttachment): Promise<void> {
        await withTransaction(async (tx) => {
            const affectedRows = await this.repository.attachPaymentProvider(tx, reservationToken, attachment);
            if (affectedRows !== 1) {
                throw createReservationError("Checkout reservation is no longer available.", HTTP_STATUS.CONFLICT);
            }
        });
    }

    async attachPayOSAttemptProvider(pendingCheckoutId: number, attachment: PaymentProviderAttachment): Promise<void> {
        await withTransaction(async (tx) => {
            const affectedRows = await this.repository.attachPaymentProviderByCheckoutId(tx, pendingCheckoutId, attachment);
            if (affectedRows !== 1) throw createReservationError("Checkout reservation is no longer available.", HTTP_STATUS.CONFLICT);
        });
    }

    async expirePayOSOrder(providerOrderCode: number): Promise<number> {
        return withTransaction(async (tx) => {
            const pendingCheckout = await this.repository.getPendingCheckoutByProviderOrderCodeForUpdate(tx, PAYMENT_PROVIDER.PAYOS, providerOrderCode);
            if (!pendingCheckout) return 0;

            const affectedRows = await this.repository.expireReservationByProviderOrderCode(tx, PAYMENT_PROVIDER.PAYOS, providerOrderCode);
            // A verified late PayOS payment may still finalize an expired checkout.
            // Keep its points and voucher held until provider cancellation is confirmed.
            return affectedRows;
        });
    }

    async getAvailableQuantity(productId: number): Promise<number> {
        return withTransaction((tx) => this.repository.getAvailableQuantity(tx, productId));
    }

    private aggregateItems(cart: CartItemRow[]): CheckoutReservationItem[] {
        const quantities = new Map<number, number>();
        for (const item of cart || []) {
            const productId = getProductId(item as ReservationCartItem);
            const quantity = getQuantity(item as ReservationCartItem);
            if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
                throw createReservationError("Cart contains an invalid product quantity", HTTP_STATUS.BAD_REQUEST);
            }
            quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
        }
        return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    }

    private resolveIdentity(input: CheckoutReservationInput): OrderIdentity {
        if (input.identity) return input.identity;
        if (input.uid) return { kind: "authenticated", userId: input.uid };
        throw createReservationError("Checkout identity is required", HTTP_STATUS.BAD_REQUEST);
    }
}
