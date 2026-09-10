import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CartCheckoutItem } from "../cart/cart.dto";
import { NestCartService } from "../cart/cart.service";
import { buildPaymentQuote } from "../payments/currency";
import { PayOSService } from "../payments/payos.service";
import { NestOrdersService, createCheckoutError } from "./orders.service";
import { calculatePromotionDiscount } from "./orders.pricing";
import { CheckoutReservationService } from "./checkout-reservation.service";
import { generateGuestOrderToken, hashGuestOrderToken } from "./guest-order-token";
import type { GuestPayOSCheckoutPayload } from "./orders.dto";
import type { CartItemRow } from "../cart/cart.types";
import type { OrderIdentity } from "./orders.types";

type AuthenticatedPayOSCheckoutInput = {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount?: number;
    discountCode?: string;
    shippingAddress: string;
};

type AuthoritativePayOSCheckoutInput = {
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    discountCode?: string;
    shippingAddress: string;
};

export type PayOSCheckoutResult = {
    url: string;
    orderCode: number;
    paymentLinkId: string;
    amount: number;
    currency: "VND";
};

export const createPayOSOrderCode = (pendingCheckoutId: number, now = Date.now()): number => {
    const orderCode = now * 1000 + pendingCheckoutId;
    if (!Number.isSafeInteger(orderCode) || orderCode <= 0) {
        throw createCheckoutError("Unable to create a PayOS order code.", 500);
    }
    return orderCode;
};

@Injectable()
export class NestOrdersPayOSService {
    constructor(
        private readonly cartService: NestCartService,
        private readonly ordersService: NestOrdersService,
        private readonly payosService: PayOSService,
        private readonly checkoutReservationService: CheckoutReservationService,
    ) {}

    async createCheckoutSession(uid: string, input: AuthenticatedPayOSCheckoutInput): Promise<PayOSCheckoutResult> {
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

        return this.createPaymentLinkForIdentity(
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

    async createGuestCheckoutSession(payload: GuestPayOSCheckoutPayload): Promise<PayOSCheckoutResult & { guestOrderToken: string }> {
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
        const result = await this.createPaymentLinkForIdentity(identity, {
            authoritativeCart: preview.cartItems,
            authoritativeTotalPrice: preview.merchandiseTotal,
            discount: preview.promotion.discount,
            discountCode: payload.discountCode,
            shippingAddress: JSON.stringify(payload.shipping),
        });
        return { ...result, guestOrderToken };
    }

    private async createPaymentLinkForIdentity(
        identity: OrderIdentity,
        input: AuthoritativePayOSCheckoutInput,
    ): Promise<PayOSCheckoutResult> {
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

        let paymentLinkId: string | null = null;
        try {
            const payableTotal = Math.max(input.authoritativeTotalPrice - reservation.pricingSnapshot.discount, 0);
            if (payableTotal <= 0) {
                throw createCheckoutError("Order total must be greater than zero to pay with PayOS.", 400);
            }
            const quote = buildPaymentQuote(payableTotal, "payos", env.payosUsdToVndRate, env.storeCurrency || "USD");
            const orderCode = createPayOSOrderCode(reservation.pendingCheckoutId);
            const returnUrl = `${env.clientUrl}/checkout-success?payment_provider=payos&payos_order_code=${orderCode}`;
            const cancelUrl = `${env.clientUrl}/cart?payment=cancelled`;
            const description = `DE${String(orderCode).slice(-7)}`;

            if (env.paymentProviderMode === "mock") {
                paymentLinkId = `mock_payos_${randomUUID()}`;
                await this.checkoutReservationService.attachPaymentProvider(reservation.reservationToken, {
                    provider: "payos",
                    providerReference: paymentLinkId,
                    providerOrderCode: orderCode,
                    paymentAmount: quote.amount,
                    paymentCurrency: quote.currency,
                    paymentFxRate: quote.fxRate,
                });
                const mockUrl = `${env.clientUrl}/mock-payos-checkout?payos_order_code=${orderCode}&payment_link_id=${encodeURIComponent(paymentLinkId)}&amount=${quote.amount}`;
                return { url: mockUrl, orderCode, paymentLinkId, amount: quote.amount, currency: "VND" };
            }

            const link = await this.payosService.createPaymentLink({
                orderCode,
                amount: quote.amount,
                description,
                returnUrl,
                cancelUrl,
                expiredAt: Math.floor(reservation.expiresAt.getTime() / 1000),
            });
            paymentLinkId = link.paymentLinkId;
            if (
                !link.checkoutUrl
                || link.orderCode !== orderCode
                || link.amount !== quote.amount
                || link.currency !== "VND"
            ) {
                throw new Error("PayOS returned an invalid payment link quote.");
            }

            await this.checkoutReservationService.attachPaymentProvider(reservation.reservationToken, {
                provider: "payos",
                providerReference: link.paymentLinkId,
                providerOrderCode: link.orderCode,
                paymentAmount: quote.amount,
                paymentCurrency: quote.currency,
                paymentFxRate: quote.fxRate,
            });

            return {
                url: link.checkoutUrl,
                orderCode: link.orderCode,
                paymentLinkId: link.paymentLinkId,
                amount: quote.amount,
                currency: "VND",
            };
        } catch (error) {
            if (paymentLinkId && env.paymentProviderMode === "live") {
                await this.payosService.cancelPaymentLink(paymentLinkId, "Checkout reservation could not be attached").catch((cancelError) => {
                    logger.error({ err: cancelError, paymentLinkId }, "[createPayOSCheckout] failed to cancel orphaned PayOS link");
                });
            }
            await this.checkoutReservationService.releaseReservation(reservation.reservationToken, "payos_checkout_create_failed").catch((releaseError) => {
                logger.error({ err: releaseError }, "[createPayOSCheckout] failed to release reservation");
            });
            if ((error as { statusCode?: number }).statusCode) throw error;
            throw createCheckoutError(`Unable to start PayOS checkout right now. ${(error as Error)?.message || "Please try again."}`, 502);
        }
    }

    async handlePaymentWebhook(orderCode: number, paymentLinkId: string, amount: number): Promise<void> {
        const order = await this.ordersService.finalizePayOSCheckout(orderCode, paymentLinkId, amount);
        if (!order) logger.error({ orderCode, paymentLinkId }, "[handlePayOSWebhook] no pending checkout found");
    }

    async confirmMockPayment(orderCode: number, paymentLinkId: string, amount: number): Promise<{ id: number; date_added: string }> {
        if (env.paymentProviderMode !== "mock") {
            throw createCheckoutError("The PayOS simulator is disabled outside mock payment mode.", 404);
        }

        const order = await this.ordersService.finalizePayOSCheckout(orderCode, paymentLinkId, amount);
        if (!order) {
            throw createCheckoutError("Mock PayOS checkout was not found.", 404);
        }
        return order;
    }

    async expirePayment(orderCode: number): Promise<number> {
        return this.checkoutReservationService.expirePayOSOrder(orderCode);
    }
}
