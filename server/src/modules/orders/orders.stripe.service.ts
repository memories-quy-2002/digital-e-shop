// Imported via ESM namespace import (not CJS require()) so that vi.mock()
// in tests can intercept these calls — Vitest's mock registry does not see
// plain require() calls made from within a vite-node-transformed ESM
// module. These sibling modules export via `module.exports = {...}`
// without an `export default`, so TS can't see named members through a
// typed default/namespace import — cast through narrow local interfaces
// describing only the functions actually called here instead of a blanket
// `any`, so the rest of this file keeps type checking on these calls.
import * as cartServiceModule from "#src/modules/cart/cart.service";
import * as orderServiceModule from "./orders.service";
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CheckoutValidationResult } from "#src/modules/cart/cart.types";
import type { CartCheckoutItem } from "#src/modules/cart/cart.dto";
import type { PendingCheckoutRow } from "./orders.types";

type CartServiceApi = {
    validateCheckoutSubmission: (uid: string, cart: CartCheckoutItem[], totalPrice: number) => Promise<CheckoutValidationResult>;
};
type OrderServiceApi = {
    createCheckoutError: (message: string, statusCode?: number, details?: Record<string, unknown>) => Error & { statusCode: number; details: Record<string, unknown> };
    insertPendingCheckout: (input: { stripeSessionId: string; userId: string; cartJson: string; totalPrice: number; discount: number; shippingAddress: string }) => Promise<void>;
    getPendingCheckoutBySessionId: (stripeSessionId: string) => Promise<PendingCheckoutRow | null>;
    createOrderFromValidatedCart: (input: {
        uid: string;
        authoritativeCart: unknown[];
        authoritativeTotalPrice: number;
        discount: number;
        shippingAddress: string;
        paymentMethod: string;
        allowOversell?: boolean;
        stripeCheckoutSessionId?: string | null;
        stripePaymentIntentId?: string | null;
    }) => Promise<{ id: number; date_added: string }>;
    markPendingCheckoutConsumed: (stripeSessionId: string) => Promise<number>;
};

const cartService = cartServiceModule as unknown as CartServiceApi;
const orderService = orderServiceModule as unknown as OrderServiceApi;

async function createCheckoutSession(
    uid: string,
    { totalPrice, cart, discount, shippingAddress }: { totalPrice: number; cart: CartCheckoutItem[]; discount: number; shippingAddress: string },
): Promise<{ url: string }> {
    const checkoutValidation = await cartService.validateCheckoutSubmission(uid, cart, totalPrice);

    if (checkoutValidation.cartItems.length === 0) {
        throw orderService.createCheckoutError("Your cart is empty. Refresh your cart and try again.", 400);
    }
    if (checkoutValidation.issues.length > 0) {
        throw orderService.createCheckoutError(
            "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
            409,
            { issues: checkoutValidation.issues, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
        );
    }
    if (checkoutValidation.mismatches.length > 0) {
        throw orderService.createCheckoutError(
            "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
            409,
            { mismatches: checkoutValidation.mismatches, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
        );
    }

    const authoritativeCart = checkoutValidation.cartItems;
    const authoritativeTotalPrice = checkoutValidation.authoritativeTotalPrice;
    const payableTotal = Math.max(authoritativeTotalPrice - Number(discount || 0), 0);
    const itemCount = authoritativeCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    if (payableTotal <= 0) {
        throw orderService.createCheckoutError("Order total must be greater than zero to pay by card.", 400);
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
        throw orderService.createCheckoutError(
            `Unable to start checkout right now. ${stripeError.message || "Please try again."}`,
            500,
            { stripeCode: stripeError.code, stripeType: stripeError.type },
        );
    }

    if (!session.url) {
        throw orderService.createCheckoutError("Stripe did not return a checkout URL. Please try again.", 500);
    }

    try {
        await orderService.insertPendingCheckout({
            stripeSessionId: session.id,
            userId: uid,
            cartJson: JSON.stringify(authoritativeCart),
            totalPrice: authoritativeTotalPrice,
            discount: Number(discount || 0),
            shippingAddress,
        });
    } catch (err) {
        // Stripe already issued a session but we couldn't persist the local
        // intent row — expire the Stripe session so the user isn't charged
        // for a checkout we have no record of, then surface the real error.
        try {
            await stripeClient.checkout.sessions.expire(session.id);
        } catch (expireErr) {
            logger.error({ err: expireErr, sessionId: session.id }, "[createCheckoutSession] failed to expire orphaned stripe session");
        }
        logger.error({ err, uid, sessionId: session.id }, "[createCheckoutSession] pending_checkouts insert failed");
        throw orderService.createCheckoutError(
            `Unable to start checkout right now. ${(err as Error)?.message || "Please try again."}`,
            500,
        );
    }

    return { url: session.url };
}

async function handleCheckoutSessionCompleted(session: { id: string; payment_intent: string | { id: string } | null }): Promise<void> {
    const pending = await orderService.getPendingCheckoutBySessionId(session.id);
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
        await orderService.createOrderFromValidatedCart({
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

        await orderService.markPendingCheckoutConsumed(session.id);
    } catch (err) {
        logger.error({ err, sessionId: session.id }, "[handleCheckoutSessionCompleted] failed to create order from confirmed payment");
        throw err;
    }
}

module.exports = { createCheckoutSession, handleCheckoutSessionCompleted };
