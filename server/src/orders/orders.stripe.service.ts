import { Injectable } from "@nestjs/common";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CartCheckoutItem } from "../cart/cart.dto";
import { NestCartService } from "../cart/cart.service";
import { StripeService } from "../stripe/stripe.service";
import { NestOrdersService, createCheckoutError } from "./orders.service";
import { calculatePromotionDiscount } from "./orders.pricing";
import { CheckoutReservationService } from "./checkout-reservation.service";

@Injectable()
export class NestOrdersStripeService {
    constructor(
        private readonly cartService: NestCartService,
        private readonly ordersService: NestOrdersService,
        private readonly stripeService: StripeService,
        private readonly checkoutReservationService: CheckoutReservationService,
    ) {}

    async createCheckoutSession(
        uid: string,
        {
            totalPrice,
            cart,
            discountCode,
            shippingAddress,
        }: {
            totalPrice: number;
            cart: CartCheckoutItem[];
            discount?: number;
            discountCode?: string;
            shippingAddress: string;
        },
    ): Promise<{ url: string }> {
        const checkoutValidation = await this.cartService.validateCheckoutSubmission(uid, cart, totalPrice);

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

        const authoritativeCart = checkoutValidation.cartItems;
        const authoritativeTotalPrice = checkoutValidation.authoritativeTotalPrice;
        const promotion = discountCode ? await this.ordersService.applyDiscount(discountCode) : null;
        if (discountCode && !promotion) {
            throw createCheckoutError("Discount code is no longer valid.", 400);
        }
        const authoritativeDiscount = calculatePromotionDiscount(promotion, authoritativeTotalPrice);
        const itemCount = authoritativeCart.reduce((sum: number, item) => sum + (Number(item.quantity) || 0), 0);

        const reservation = await this.checkoutReservationService.reserveInventory({
            uid,
            authoritativeCart,
            authoritativeTotalPrice,
            discount: authoritativeDiscount,
            discountCode,
            shippingAddress,
            databaseExpiresAt: new Date((Math.ceil(Date.now() / 1000) + 35 * 60) * 1000),
        });
        const stripeExpiresAt = Math.ceil(Date.now() / 1000) + 30 * 60;
        const payableTotal = Math.max(authoritativeTotalPrice - reservation.pricingSnapshot.discount, 0);
        if (payableTotal <= 0) {
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "zero_payable_total");
            throw createCheckoutError("Order total must be greater than zero to pay by card.", 400);
        }

        let session;
        try {
            session = await this.stripeService.createCheckoutSession({
                mode: "payment",
                expires_at: stripeExpiresAt,
                client_reference_id: reservation.reservationToken,
                payment_method_types: ["card"],
                line_items: [
                    {
                        price_data: {
                            currency: "usd",
                            product_data: { name: `Digital-E order (${itemCount} item(s))` },
                            unit_amount: Math.round(payableTotal * 100),
                        },
                        quantity: 1,
                    },
                ],
                success_url: `${env.clientUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${env.clientUrl}/cart`,
                metadata: { uid, reservationToken: reservation.reservationToken },
            });
        } catch (err) {
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "stripe_session_create_failed").catch((releaseErr) => {
                logger.error({ err: releaseErr, reservationToken: reservation.reservationToken }, "[createCheckoutSession] failed to release reservation after stripe error");
            });
            const stripeError = err as Error & { code?: string; type?: string; statusCode?: number; raw?: unknown };
            logger.error({
                err,
                uid,
                itemCount,
                stripeCode: stripeError.code,
                stripeType: stripeError.type,
                stripeStatus: stripeError.statusCode,
            }, "[createCheckoutSession] stripe session creation failed");
            throw createCheckoutError(
                `Unable to start checkout right now. ${stripeError.message || "Please try again."}`,
                500,
                { stripeCode: stripeError.code, stripeType: stripeError.type },
            );
        }

        if (!session.url) {
            await this.stripeService.expireCheckoutSession(session.id).catch((expireErr) => {
                logger.error({ err: expireErr, sessionId: session.id }, "[createCheckoutSession] failed to expire Stripe session without URL");
            });
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "stripe_checkout_url_missing").catch((releaseErr) => {
                logger.error({ err: releaseErr, reservationToken: reservation.reservationToken }, "[createCheckoutSession] failed to release reservation without URL");
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
                logger.error({ err: releaseErr, reservationToken: reservation.reservationToken }, "[createCheckoutSession] failed to release unattached reservation");
            });
            logger.error({ err, uid, sessionId: session.id }, "[createCheckoutSession] failed to attach Stripe session to reservation");
            throw createCheckoutError(
                `Unable to start checkout right now. ${(err as Error)?.message || "Please try again."}`,
                500,
            );
        }

        return { url: session.url };
    }

    async handleCheckoutSessionCompleted(session: { id: string; payment_intent: string | { id: string } | null }): Promise<void> {
        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;
        const order = await this.ordersService.finalizeReservedCheckout(session.id, paymentIntentId);
        if (!order) {
            logger.error({ sessionId: session.id }, "[handleCheckoutSessionCompleted] no pending checkout found for session");
        }
    }

    async handleCheckoutSessionExpired(session: { id: string }): Promise<void> {
        const affectedRows = await this.ordersService.markPendingCheckoutExpired(session.id);
        logger.info({ sessionId: session.id, affectedRows }, "[handleCheckoutSessionExpired] checkout reservation expired");
    }
}
