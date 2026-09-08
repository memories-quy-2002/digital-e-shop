import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTransaction } from "../database/transaction";
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { PromotionsRepository } from "../promotions/promotions.repository";
import type { CartItemRow } from "../cart/cart.types";
import type {
    CheckoutReservation,
    CheckoutReservationInput,
    CheckoutReservationItem,
    OrderIdentity,
} from "./orders.types";

type ReservationError = Error & {
    statusCode?: number;
    details?: Record<string, unknown>;
};

export const createReservationError = (
    message: string,
    statusCode = 409,
    details: Record<string, unknown> = {},
): ReservationError => Object.assign(new Error(message), { statusCode, details });

const DEFAULT_RESERVATION_WINDOW_MS = 35 * 60_000;

type ReservationCartItem = CartItemRow & {
    productId?: number;
};

const getProductId = (item: ReservationCartItem): number => Number(item.product_id ?? item.productId ?? 0);

const getQuantity = (item: ReservationCartItem): number => Number(item.quantity ?? 0);

@Injectable()
export class CheckoutReservationService {
    constructor(
        private readonly repository: CheckoutReservationRepository,
        private readonly promotionsRepository: PromotionsRepository,
    ) {}

    async reserveInventory(input: CheckoutReservationInput): Promise<CheckoutReservation> {
        const aggregatedItems = this.aggregateItems(input.authoritativeCart);
        if (aggregatedItems.length === 0) {
            throw createReservationError("Cart cannot be empty", 400);
        }

        const expiresAt = input.databaseExpiresAt ?? new Date(Date.now() + DEFAULT_RESERVATION_WINDOW_MS);
        if (expiresAt.getTime() <= Date.now()) {
            throw createReservationError("Checkout reservation expiry must be in the future", 400);
        }

        const reservationToken = randomUUID();
        const identity = this.resolveIdentity(input);
        return withTransaction(async (tx) => {
            const productIds = aggregatedItems.map((item) => item.productId).sort((a, b) => a - b);
            const lockedProducts = await this.repository.lockProducts(tx, productIds);
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

            return {
                pendingCheckoutId: pendingCheckout.insertId,
                reservationToken,
                expiresAt,
                cartSnapshot: input.authoritativeCart,
                pricingSnapshot: {
                    totalPrice: input.authoritativeTotalPrice,
                    discount: appliedDiscount,
                },
                shippingAddress: input.shippingAddress,
                items: aggregatedItems,
            };
        });
    }

    async releaseReservation(reservationToken: string, reason: string): Promise<void> {
        await withTransaction(async (tx) => {
            const pendingCheckout = await this.repository.getPendingCheckoutByTokenForUpdate(tx, reservationToken);
            await this.repository.releaseReservation(tx, reservationToken, reason);
            if (pendingCheckout?.discount_id) {
                await this.promotionsRepository.releasePromotionReservation(tx, pendingCheckout.id);
            }
        });
    }

    async attachStripeSession(reservationToken: string, stripeSessionId: string): Promise<void> {
        await withTransaction(async (tx) => {
            const affectedRows = await this.repository.attachStripeSession(tx, reservationToken, stripeSessionId);
            if (affectedRows !== 1) {
                throw createReservationError("Checkout reservation is no longer available.", 409);
            }
        });
    }

    async expireStripeSession(stripeSessionId: string): Promise<number> {
        return withTransaction(async (tx) => {
            const pendingCheckout = await this.repository.getPendingCheckoutForUpdate(tx, stripeSessionId);
            if (!pendingCheckout) return 0;

            const affectedRows = await this.repository.expireReservationBySession(tx, stripeSessionId);
            if (affectedRows === 1 && pendingCheckout.discount_id) {
                await this.promotionsRepository.releasePromotionReservation(tx, pendingCheckout.id);
            }
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
                throw createReservationError("Cart contains an invalid product quantity", 400);
            }
            quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
        }
        return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
    }

    private resolveIdentity(input: CheckoutReservationInput): OrderIdentity {
        if (input.identity) return input.identity;
        if (input.uid) return { kind: "authenticated", userId: input.uid };
        throw createReservationError("Checkout identity is required", 400);
    }
}
