import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CartCheckoutItem } from "../cart/cart.dto";
import { NestCartService } from "../cart/cart.service";
import { StripeService } from "../stripe/stripe.service";
import { NestOrdersService, createCheckoutError } from "./orders.service";
import { calculatePromotionDiscount } from "./orders.pricing";
import { CheckoutReservationService } from "./checkout-reservation.service";
import { generateGuestOrderToken, hashGuestOrderToken } from "./guest-order-token";
import type { GuestCheckoutSessionPayload } from "./orders.dto";
import type { CartItemRow } from "../cart/cart.types";
import type { OrderIdentity } from "./orders.types";

type AuthenticatedCheckoutInput = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount?: number;
    discountCode?: string;
    shippingAddress: string;
};

type AuthoritativeCheckoutInput = {
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    discountCode?: string;
    shippingAddress: string;
};

@Injectable()
export class NestOrdersStripeService {
    constructor(
        private readonly cartService: NestCartService,
        private readonly ordersService: NestOrdersService,
        private readonly stripeService: StripeService,
        private readonly checkoutReservationService: CheckoutReservationService,
    ) {}

    async createCheckoutSession(uid: string, input: AuthenticatedCheckoutInput): Promise<{ url: string }> {
        const checkoutValidation = await this.cartService.validateCheckoutSubmission(uid, input.cart, input.totalPrice);

        if (checkoutValidation.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", 400);
        }
        if (checkoutValidation.issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                { issues: checkoutValidation.issues, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
            );
        }
        if (checkoutValidation.mismatches.length > 0) {
            throw createCheckoutError(
                "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
                409,
                { mismatches: checkoutValidation.mismatches, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
            );
        }

        const promotion = input.discountCode ? await this.ordersService.applyDiscount(input.discountCode) : null;
        if (input.discountCode && !promotion) {
            throw createCheckoutError("Discount code is no longer valid.", 400);
        }

        return this.createCheckoutSessionForIdentity(
            { kind: "authenticated", userId: uid },
            {
                authoritativeCart: checkoutValidation.cartItems,
                authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
                discount: calculatePromotionDiscount(promotion, checkoutValidation.authoritativeTotalPrice),
                discountCode: input.discountCode,
                shippingAddress: input.shippingAddress,
            },
        );
    }

    async createGuestCheckoutSession(payload: GuestCheckoutSessionPayload): Promise<{ url: string; guestOrderToken: string }> {
        const preview = await this.cartService.previewGuestCart(payload.cart, payload.discountCode);
        if (preview.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", 400);
        }
        if (preview.issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                { issues: preview.issues, authoritativeCart: preview.cartItems, authoritativeTotalPrice: preview.merchandiseTotal },
            );
        }
        if (payload.discountCode && !preview.promotion.valid) {
            throw createCheckoutError(preview.promotion.message || "Discount code is no longer valid.", 400);
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
        const result = await this.createCheckoutSessionForIdentity(identity, {
            authoritativeCart: preview.cartItems,
            authoritativeTotalPrice: preview.merchandiseTotal,
            discount: preview.promotion.discount,
            discountCode: payload.discountCode,
            shippingAddress: JSON.stringify(payload.shipping),
        });
        return { ...result, guestOrderToken };
    }

    private async createCheckoutSessionForIdentity(
        identity: OrderIdentity,
        input: AuthoritativeCheckoutInput,
    ): Promise<{ url: string }> {
        const itemCount = input.authoritativeCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
        const reservationBase = {
            authoritativeCart: input.authoritativeCart,
            authoritativeTotalPrice: input.authoritativeTotalPrice,
            discount: input.discount,
            discountCode: input.discountCode,
            shippingAddress: input.shippingAddress,
            databaseExpiresAt: new Date((Math.ceil(Date.now() / 1000) + 35 * 60) * 1000),
        };
        const reservation = identity.kind === "authenticated"
            ? await this.checkoutReservationService.reserveInventory({ ...reservationBase, uid: identity.userId })
            : await this.checkoutReservationService.reserveInventory({ ...reservationBase, identity });
        const stripeExpiresAt = Math.ceil(Date.now() / 1000) + 30 * 60;
        const payableTotal = Math.max(input.authoritativeTotalPrice - reservation.pricingSnapshot.discount, 0);
        if (payableTotal <= 0) {
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "zero_payable_total");
            throw createCheckoutError("Order total must be greater than zero to pay by card.", 400);
        }

        if (env.paymentProviderMode === "mock") {
            const mockSessionId = identity.kind === "guest"
                ? `mock_stripe_${randomUUID()}`
                : `mock_stripe_${reservation.reservationToken}`;
            const mockPaymentIntentId = identity.kind === "guest"
                ? `mock_pi_${randomUUID()}`
                : `mock_pi_${reservation.reservationToken}`;
            try {
                await this.checkoutReservationService.attachStripeSession(reservation.reservationToken, mockSessionId);
                const order = await this.ordersService.finalizeReservedCheckout(mockSessionId, mockPaymentIntentId);
                if (!order) throw new Error("Mock Stripe checkout did not produce an order.");
            } catch (err) {
                await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "mock_checkout_finalize_failed").catch((releaseErr) => {
                    logger.error({ err: releaseErr }, "[createCheckoutSession] failed to release mock reservation");
                });
                throw createCheckoutError(`Unable to complete mock checkout. ${(err as Error)?.message || "Please try again."}`, 500);
            }
            return { url: `${env.clientUrl}/checkout-success?session_id=${encodeURIComponent(mockSessionId)}` };
        }

        let session;
        try {
            session = await this.stripeService.createCheckoutSession({
                mode: "payment",
                expires_at: stripeExpiresAt,
                payment_method_types: ["card"],
                line_items: [{
                    price_data: {
                        currency: "usd",
                        product_data: { name: `Digital-E order (${itemCount} item(s))` },
                        unit_amount: Math.round(payableTotal * 100),
                    },
                    quantity: 1,
                }],
                success_url: `${env.clientUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${env.clientUrl}/cart`,
                ...(identity.kind === "authenticated"
                    ? {
                        client_reference_id: reservation.reservationToken,
                        metadata: { uid: identity.userId, reservationToken: reservation.reservationToken },
                    }
                    : {}),
            });
        } catch (err) {
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "stripe_session_create_failed").catch((releaseErr) => {
                logger.error({ err: releaseErr }, "[createCheckoutSession] failed to release reservation after stripe error");
            });
            const stripeError = err as Error & { code?: string; type?: string; statusCode?: number };
            logger.error({
                err,
                identityKind: identity.kind,
                itemCount,
                stripeCode: stripeError.code,
                stripeType: stripeError.type,
                stripeStatus: stripeError.statusCode,
            }, "[createCheckoutSession] stripe session creation failed");
            throw createCheckoutError(`Unable to start checkout right now. ${stripeError.message || "Please try again."}`, 500, {
                stripeCode: stripeError.code,
                stripeType: stripeError.type,
            });
        }

        if (!session.url) {
            await this.stripeService.expireCheckoutSession(session.id).catch((expireErr) => {
                logger.error({ err: expireErr, sessionId: session.id }, "[createCheckoutSession] failed to expire Stripe session without URL");
            });
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "stripe_checkout_url_missing").catch((releaseErr) => {
                logger.error({ err: releaseErr }, "[createCheckoutSession] failed to release reservation without URL");
            });
            throw createCheckoutError("Stripe did not return a checkout URL. Please try again.", 500);
        }

        try {
            await this.checkoutReservationService.attachStripeSession(reservation.reservationToken, session.id);
        } catch (err) {
            try {
                await this.stripeService.expireCheckoutSession(session.id);
            } catch (expireErr) {
                logger.error({ err: expireErr, sessionId: session.id }, "[createCheckoutSession] failed to expire orphaned stripe session");
            }
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "stripe_session_attach_failed").catch((releaseErr) => {
                logger.error({ err: releaseErr }, "[createCheckoutSession] failed to release unattached reservation");
            });
            logger.error({ err, identityKind: identity.kind, sessionId: session.id }, "[createCheckoutSession] failed to attach Stripe session to reservation");
            throw createCheckoutError(`Unable to start checkout right now. ${(err as Error)?.message || "Please try again."}`, 500);
        }

        return { url: session.url };
    }

    async handleCheckoutSessionCompleted(session: { id: string; payment_intent: string | { id: string } | null }): Promise<void> {
        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
        const order = await this.ordersService.finalizeReservedCheckout(session.id, paymentIntentId);
        if (!order) logger.error({ sessionId: session.id }, "[handleCheckoutSessionCompleted] no pending checkout found for session");
    }

    async handleCheckoutSessionExpired(session: { id: string }): Promise<void> {
        const affectedRows = await this.ordersService.markPendingCheckoutExpired(session.id);
        logger.info({ sessionId: session.id, affectedRows }, "[handleCheckoutSessionExpired] checkout reservation expired");
    }
}
