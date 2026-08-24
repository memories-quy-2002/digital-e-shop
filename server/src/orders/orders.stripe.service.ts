import { Injectable } from "@nestjs/common";
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CartCheckoutItem } from "../cart/cart.dto";
import { NestCartService } from "../cart/cart.service";
import { NestOrdersService, createCheckoutError } from "./orders.service";
import { calculatePromotionDiscount } from "./orders.pricing";

@Injectable()
export class NestOrdersStripeService {
    constructor(
        private readonly cartService: NestCartService,
        private readonly ordersService: NestOrdersService,
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
        const payableTotal = Math.max(authoritativeTotalPrice - authoritativeDiscount, 0);
        const itemCount = authoritativeCart.reduce((sum: number, item) => sum + (Number(item.quantity) || 0), 0);

        if (payableTotal <= 0) {
            throw createCheckoutError("Order total must be greater than zero to pay by card.", 400);
        }

        let session;
        try {
            session = await stripeClient.checkout.sessions.create({
                mode: "payment",
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
                metadata: { uid },
            });
        } catch (err) {
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
            throw createCheckoutError("Stripe did not return a checkout URL. Please try again.", 500);
        }

        try {
            await this.ordersService.insertPendingCheckout({
                stripeSessionId: session.id,
                userId: uid,
                cartJson: JSON.stringify(authoritativeCart),
                totalPrice: authoritativeTotalPrice,
                discount: authoritativeDiscount,
                shippingAddress,
            });
        } catch (err) {
            try {
                await stripeClient.checkout.sessions.expire(session.id);
            } catch (expireErr) {
                logger.error({ err: expireErr, sessionId: session.id }, "[createCheckoutSession] failed to expire orphaned stripe session");
            }
            logger.error({ err, uid, sessionId: session.id }, "[createCheckoutSession] pending_checkouts insert failed");
            throw createCheckoutError(
                `Unable to start checkout right now. ${(err as Error)?.message || "Please try again."}`,
                500,
            );
        }

        return { url: session.url };
    }

    async handleCheckoutSessionCompleted(session: { id: string; payment_intent: string | { id: string } | null }): Promise<void> {
        const pending = await this.ordersService.getPendingCheckoutBySessionId(session.id);
        if (!pending) {
            logger.error({ sessionId: session.id }, "[handleCheckoutSessionCompleted] no pending checkout found for session");
            return;
        }
        if (pending.consumed_at) {
            logger.info({ sessionId: session.id }, "[handleCheckoutSessionCompleted] session already consumed, skipping");
            return;
        }

        const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

        try {
            await this.ordersService.createOrderFromValidatedCart({
                uid: pending.user_id,
                authoritativeCart: JSON.parse(pending.cart_json),
                authoritativeTotalPrice: Number(pending.total_price),
                discount: Number(pending.discount),
                shippingAddress: pending.shipping_address,
                paymentMethod: "card",
                allowOversell: true,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
            });

            await this.ordersService.markPendingCheckoutConsumed(session.id);
        } catch (err) {
            const existingOrder = await this.ordersService.getOrderByStripeSessionId(session.id).catch(() => null);
            if (existingOrder) {
                logger.info(
                    { sessionId: session.id, orderId: existingOrder.id },
                    "[handleCheckoutSessionCompleted] session already created an order, marking consumed",
                );
                await this.ordersService.markPendingCheckoutConsumed(session.id);
                return;
            }

            logger.error({ err, sessionId: session.id }, "[handleCheckoutSessionCompleted] failed to create order from confirmed payment");
            throw err;
        }
    }
}
