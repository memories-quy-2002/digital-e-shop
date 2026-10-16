import { Injectable } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { randomUUID } from "node:crypto";
import { env } from "#src/config/env.config";
import type { CartCheckoutItem } from "../cart/cart.dto";
import { NestCartService } from "../cart/cart.service";
import { PAYMENT_CURRENCY, PAYMENT_PROVIDER, type PaymentCurrency } from "../payments/payment.types";
import { CHECKOUT_RESERVATION_WINDOW_MS } from "#src/shared/constants/checkout-reservation";
import { PayOSService } from "../payments/payos.service";
import { PaymentAttemptService } from "../payments/payment-attempt.service";
import type { PaymentAttemptClaim, PaymentAttemptOwner } from "../payments/payment-attempt.types";
import { NestOrdersService, createCheckoutError } from "./orders.service";
import { calculatePromotionDiscount } from "./orders.pricing";
import { CheckoutReservationService, ExistingPayOSAttemptReplayError } from "./checkout-reservation.service";
import { generateGuestOrderToken, hashGuestOrderToken } from "./guest-order-token";
import type { GuestPayOSCheckoutPayload } from "./orders.dto";
import type { CartItemRow } from "../cart/cart.types";
import type { OrderIdentity } from "./orders.types";
import type { DeliveryCheckoutInput } from "./orders.dto";
import type { QuoteCheckout } from "../shipping/shipping-quote.service";

type AuthenticatedPayOSCheckoutInput = DeliveryCheckoutInput & {
    totalPrice: number;
    cart: CartCheckoutItem[];
    discount?: number;
    discountCode?: string;
    loyaltyPoints?: number;
    shippingAddress: string;
};

type AuthoritativePayOSCheckoutInput = {
    deliveryCheckout: QuoteCheckout;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    discountCode?: string;
    loyaltyPoints?: number;
    shippingAddress: string;
};

export type PayOSCheckoutResult = {
    attemptId: string;
    sessionState: "CREATING" | "READY" | "CLOSED";
    url: string | null;
    orderCode: number;
    paymentLinkId: string | null;
    amount: number;
    currency: PaymentCurrency;
};

type PayOSCheckoutSession = { result: PayOSCheckoutResult; replayed: boolean };
type PayOSAttemptRequest = { owner: PaymentAttemptOwner; idempotencyKey: string; request: unknown };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PAYOS_CHECKOUT_ORIGINS = new Set(["https://pay.payos.vn", "https://next.payos.vn"]);
const CREATE_LEASE_MS = 30_000;

@Injectable()
export class NestOrdersPayOSService {
    constructor(
        private readonly cartService: NestCartService,
        private readonly ordersService: NestOrdersService,
        private readonly payosService: PayOSService,
        private readonly checkoutReservationService: CheckoutReservationService,
        private readonly paymentAttemptService: PaymentAttemptService,
    ) {}

    async createCheckoutSession(uid: string, input: AuthenticatedPayOSCheckoutInput, suppliedIdempotencyKey?: string): Promise<PayOSCheckoutResult> {
        const attemptInput: PayOSAttemptRequest = {
            owner: { kind: "authenticated", userId: uid },
            idempotencyKey: this.resolveIdempotencyKey(suppliedIdempotencyKey),
            request: input,
        };
        const replay = await this.findExistingAttempt(attemptInput);
        if (replay) return this.resumeAttempt(replay, attemptInput);

        const checkoutValidation = await this.cartService.validateCheckoutSubmission(uid, input.cart, input.totalPrice);

        if (checkoutValidation.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", HTTP_STATUS.BAD_REQUEST);
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

        const promotion = input.discountCode ? await this.ordersService.applyDiscount(input.discountCode, uid) : null;
        if (input.discountCode && !promotion) {
            throw createCheckoutError("Discount code is no longer valid.", HTTP_STATUS.BAD_REQUEST);
        }

        const session = await this.createPaymentLinkForIdentity(
            { kind: "authenticated", userId: uid },
            {
                authoritativeCart: checkoutValidation.cartItems,
                authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
                discount: calculatePromotionDiscount(promotion, checkoutValidation.authoritativeTotalPrice),
                discountCode: input.discountCode,
                loyaltyPoints: input.loyaltyPoints ?? 0,
                shippingAddress: input.shippingAddress,
                deliveryCheckout: { shippingQuoteId: input.shippingQuoteId, deliveryAddress: input.deliveryAddress, locale: input.locale, quoteIdentity: { kind: "authenticated", userId: uid } },
            },
            attemptInput,
        );
        return session.result;
    }

    async createGuestCheckoutSession(payload: GuestPayOSCheckoutPayload, guestCartId?: string, suppliedIdempotencyKey?: string): Promise<PayOSCheckoutResult & { guestOrderToken?: string }> {
        if (!guestCartId) throw createCheckoutError("Refresh your cart identity before checkout.", HTTP_STATUS.BAD_REQUEST);
        const attemptInput: PayOSAttemptRequest = {
            owner: { kind: "guest", guestCartId },
            idempotencyKey: this.resolveIdempotencyKey(suppliedIdempotencyKey),
            request: payload,
        };
        const replay = await this.findExistingAttempt(attemptInput);
        if (replay) return this.resumeAttempt(replay, attemptInput);

        const preview = await this.cartService.previewGuestCart(payload.cart, payload.discountCode);
        if (preview.cartItems.length === 0) {
            throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", HTTP_STATUS.BAD_REQUEST);
        }
        if (preview.issues.length > 0) {
            throw createCheckoutError(
                "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
                409,
                { issues: preview.issues, authoritativeCart: preview.cartItems, authoritativeTotalPrice: preview.merchandiseTotal },
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
        const result = await this.createPaymentLinkForIdentity(identity, {
            authoritativeCart: preview.cartItems,
            authoritativeTotalPrice: preview.merchandiseTotal,
            discount: preview.promotion.discount,
            discountCode: payload.discountCode,
            shippingAddress: JSON.stringify(payload.shipping),
            deliveryCheckout: { shippingQuoteId: payload.shippingQuoteId, deliveryAddress: payload.deliveryAddress, locale: payload.locale, quoteIdentity: { kind: "guest", guestCartId: guestCartId || "" } },
        }, attemptInput);
        return result.replayed ? result.result : { ...result.result, guestOrderToken };
    }

    private async createPaymentLinkForIdentity(
        identity: OrderIdentity,
        input: AuthoritativePayOSCheckoutInput,
        attemptInput: PayOSAttemptRequest,
    ): Promise<PayOSCheckoutSession> {
        const reservationBase = {
            deliveryCheckout: input.deliveryCheckout,
            authoritativeCart: input.authoritativeCart,
            authoritativeTotalPrice: input.authoritativeTotalPrice,
            discount: input.discount,
            discountCode: input.discountCode,
            loyaltyPoints: input.loyaltyPoints ?? 0,
            shippingAddress: input.shippingAddress,
            databaseExpiresAt: new Date(Date.now() + CHECKOUT_RESERVATION_WINDOW_MS),
        };
        let reservation;
        try {
            const reservationInput = identity.kind === "authenticated"
                ? { ...reservationBase, uid: identity.userId }
                : { ...reservationBase, identity };
            reservation = await this.checkoutReservationService.reservePayOSInventory(reservationInput, attemptInput);
        } catch (error) {
            if (error instanceof ExistingPayOSAttemptReplayError) {
                return { result: this.resultFromAttempt(error.paymentAttempt), replayed: true };
            }
            throw error;
        }

        const attempt = reservation.paymentAttempt;
        const initial = this.resultFromAttempt(attempt);
        if (env.paymentProviderMode === "mock") return { result: await this.createMockLink(attempt), replayed: false };
        if (env.nodeEnv === "production" && env.paymentProviderMode !== "live") {
            throw createCheckoutError("Mock PayOS checkout is disabled in production.", HTTP_STATUS.SERVICE_UNAVAILABLE);
        }
        if (initial.sessionState === "READY" || initial.sessionState === "CLOSED") return { result: initial, replayed: false };

        const result = await this.createOrRecoverLiveLink(attempt, attemptInput, false);
        return { result, replayed: false };
    }

    private async resumeAttempt(attempt: PaymentAttemptClaim, attemptInput: PayOSAttemptRequest): Promise<PayOSCheckoutResult> {
        const current = this.resultFromAttempt(attempt);
        if (current.sessionState !== "CREATING") return current;
        if (env.paymentProviderMode === "mock") return this.createMockLink(attempt);
        return this.createOrRecoverLiveLink(attempt, attemptInput, true);
    }

    private resolveIdempotencyKey(supplied: string | undefined): string {
        if (supplied === undefined) return randomUUID();
        if (!UUID_PATTERN.test(supplied)) throw createCheckoutError("A valid checkout idempotency key is required.", HTTP_STATUS.BAD_REQUEST);
        return supplied;
    }

    private findExistingAttempt(input: PayOSAttemptRequest): Promise<PaymentAttemptClaim | null> {
        return this.paymentAttemptService.findExistingClaim(input);
    }

    private resultFromAttempt(attempt: PaymentAttemptClaim): PayOSCheckoutResult {
        const orderCode = Number(attempt.providerOrderCode);
        const expiresAt = attempt.expiresAt ? new Date(attempt.expiresAt).getTime() : null;
        const attemptExpired = expiresAt !== null && expiresAt <= Date.now();
        const closed = ["PAID", "CANCELLED", "EXPIRED", "MISMATCH"].includes(attempt.paymentState)
            || attempt.orderState === "CREATED"
            || attemptExpired;
        const linkId = attempt.providerLinkId ?? null;
        const savedUrl = attempt.providerLinkUrl ?? (linkId ? this.payOSUrlForLinkId(linkId) : null);
        const sessionState = closed ? "CLOSED" : savedUrl ? "READY" : "CREATING";
        return {
            attemptId: attempt.id,
            sessionState,
            url: sessionState === "READY" ? savedUrl : null,
            orderCode,
            paymentLinkId: linkId,
            amount: attempt.expectedAmountVnd,
            currency: PAYMENT_CURRENCY.VND,
        };
    }

    private async createMockLink(attempt: PaymentAttemptClaim): Promise<PayOSCheckoutResult> {
        if (env.nodeEnv === "production") throw createCheckoutError("Mock PayOS checkout is disabled in production.", HTTP_STATUS.SERVICE_UNAVAILABLE);
        const leaseToken = randomUUID();
        const leaseAcquired = await this.paymentAttemptService.acquireCreateLease({
            attemptId: attempt.id,
            leaseToken,
            leaseUntil: new Date(Date.now() + CREATE_LEASE_MS),
        });
        if (!leaseAcquired) return this.resultFromAttempt(attempt);
        const result = this.resultFromAttempt(attempt);
        const paymentLinkId = `mock_payos_${attempt.id}`;
        const url = `${env.clientUrl}/mock-payos-checkout?payos_order_code=${result.orderCode}&payment_link_id=${encodeURIComponent(paymentLinkId)}&amount=${result.amount}&payment_attempt_id=${encodeURIComponent(attempt.id)}`;
        const saved = await this.paymentAttemptService.saveProviderLink({
            attemptId: attempt.id,
            leaseToken,
            providerOrderCode: attempt.providerOrderCode,
            providerLinkId: paymentLinkId,
            providerLinkUrl: url,
            amountVnd: attempt.expectedAmountVnd,
            currency: PAYMENT_CURRENCY.VND,
        });
        if (!saved) return this.resultFromAttempt(attempt);
        await this.checkoutReservationService.attachPayOSAttemptProvider(attempt.pendingCheckoutId, {
            provider: PAYMENT_PROVIDER.PAYOS,
            providerReference: paymentLinkId,
            providerOrderCode: result.orderCode,
            paymentAmount: result.amount,
            paymentCurrency: result.currency,
            paymentFxRate: 1,
        }).catch((): undefined => undefined);
        return { ...result, sessionState: "READY", url, paymentLinkId };
    }

    private async createOrRecoverLiveLink(
        attempt: PaymentAttemptClaim,
        attemptInput: PayOSAttemptRequest,
        lookupFirst: boolean,
    ): Promise<PayOSCheckoutResult> {
        const existing = this.resultFromAttempt(attempt);
        if (existing.sessionState === "READY" || existing.sessionState === "CLOSED") return existing;
        const leaseToken = randomUUID();
        const leaseAcquired = await this.paymentAttemptService.acquireCreateLease({
            attemptId: attempt.id,
            leaseToken,
            leaseUntil: new Date(Date.now() + CREATE_LEASE_MS),
        }).catch(() => false);
        if (!leaseAcquired) return existing;

        const orderCode = Number(attempt.providerOrderCode);
        const expiresAt = attempt.expiresAt ? new Date(attempt.expiresAt) : new Date(Date.now() + CHECKOUT_RESERVATION_WINDOW_MS);
        const createRequest = {
            orderCode,
            amount: attempt.expectedAmountVnd,
            description: `DE${String(orderCode).slice(-7)}`,
            returnUrl: `${env.clientUrl}/checkout-success?payment_provider=${PAYMENT_PROVIDER.PAYOS}&payos_order_code=${orderCode}&payment_attempt_id=${encodeURIComponent(attempt.id)}`,
            cancelUrl: `${env.clientUrl}/checkout-success?payment_provider=${PAYMENT_PROVIDER.PAYOS}&payment_attempt_id=${encodeURIComponent(attempt.id)}`,
            expiredAt: Math.floor(expiresAt.getTime() / 1000),
        };
        let link: Awaited<ReturnType<PayOSService["createPaymentLink"]>> | null = null;
        const lookup = async (): ReturnType<PayOSService["findPaymentLinkByOrderCode"]> => this.payosService.findPaymentLinkByOrderCode(orderCode);
        const create = async (): ReturnType<PayOSService["createPaymentLink"]> => this.payosService.createPaymentLink(createRequest);

        if (lookupFirst) {
            try {
                const found = await lookup();
                if (found) link = { ...found, status: found.status };
            } catch {
                return existing;
            }
        }

        if (!link) {
            if (lookupFirst && !this.isAttemptPayable(attempt, expiresAt)) return existing;
            try {
                link = await create();
            } catch {
                let found;
                try { found = await lookup(); } catch { return existing; }
                if (found) {
                    link = {
                        orderCode: found.orderCode,
                        amount: found.amount,
                        currency: found.currency,
                        paymentLinkId: found.paymentLinkId,
                        checkoutUrl: found.checkoutUrl,
                        status: found.status,
                    };
                } else {
                    if (!this.isAttemptPayable(attempt, expiresAt)) return existing;
                    try { link = await create(); } catch {
                        return existing;
                    }
                }
            }
        }
        if (!link) return existing;

        if (!this.isValidProviderLink(link, orderCode, attempt.expectedAmountVnd, lookupFirst || link.status !== "PENDING")) {
            throw createCheckoutError("PayOS returned an invalid payment link.", HTTP_STATUS.BAD_GATEWAY);
        }
        const saved = await this.paymentAttemptService.saveProviderLink({
            attemptId: attempt.id,
            leaseToken,
            providerOrderCode: attempt.providerOrderCode,
            providerLinkId: link.paymentLinkId,
            providerLinkUrl: link.checkoutUrl,
            amountVnd: attempt.expectedAmountVnd,
            currency: PAYMENT_CURRENCY.VND,
        }).catch(() => false);
        if (!saved) {
            const current = await this.findExistingAttempt(attemptInput).catch((): null => null);
            return current ? this.resultFromAttempt(current) : existing;
        }
        await this.checkoutReservationService.attachPayOSAttemptProvider(attempt.pendingCheckoutId, {
            provider: PAYMENT_PROVIDER.PAYOS,
            providerReference: link.paymentLinkId,
            providerOrderCode: link.orderCode,
            paymentAmount: link.amount,
            paymentCurrency: PAYMENT_CURRENCY.VND,
            paymentFxRate: 1,
        }).catch((): undefined => undefined);
        return {
            ...existing,
            sessionState: link.status === "PENDING" ? "READY" : "CLOSED",
            url: link.status === "PENDING" ? link.checkoutUrl : null,
            paymentLinkId: link.paymentLinkId,
        };
    }

    private isValidProviderLink(
        link: { orderCode: number; amount: number; currency: string; paymentLinkId: string; checkoutUrl: string; status: string },
        expectedOrderCode: number,
        expectedAmount: number,
        allowClosedStatus = false,
    ): boolean {
        if (!Number.isSafeInteger(link.orderCode) || link.orderCode !== expectedOrderCode
            || !Number.isSafeInteger(link.amount) || link.amount !== expectedAmount
            || link.currency !== PAYMENT_CURRENCY.VND || !link.paymentLinkId || link.paymentLinkId.length > 255
            || (!allowClosedStatus && link.status !== "PENDING")
            || (allowClosedStatus && !["PENDING", "PAID", "CANCELLED", "EXPIRED", "UNDERPAID", "PROCESSING", "FAILED"].includes(link.status))) return false;
        try {
            const url = new URL(link.checkoutUrl);
            return url.protocol === "https:" && !url.username && !url.password && PAYOS_CHECKOUT_ORIGINS.has(url.origin);
        } catch {
            return false;
        }
    }

    private payOSUrlForLinkId(paymentLinkId: string): string | null {
        if (!paymentLinkId || paymentLinkId.length > 255) return null;
        return `https://pay.payos.vn/web/${encodeURIComponent(paymentLinkId)}`;
    }

    private isAttemptPayable(attempt: PaymentAttemptClaim, expiresAt: Date): boolean {
        return expiresAt.getTime() > Date.now() && ["PENDING", "UNKNOWN"].includes(attempt.paymentState);
    }

    async confirmMockPayment(orderCode: number, paymentLinkId: string, amount: number): Promise<{ id: number; date_added: string }> {
        if (env.nodeEnv === "production" || env.paymentProviderMode !== "mock") {
            throw createCheckoutError("The PayOS simulator is disabled in production and outside mock payment mode.", HTTP_STATUS.NOT_FOUND);
        }

        const order = await this.ordersService.finalizePayOSCheckout(orderCode, paymentLinkId, amount);
        if (!order) {
            throw createCheckoutError("Mock PayOS checkout was not found.", HTTP_STATUS.NOT_FOUND);
        }
        return order;
    }

    async expirePayment(orderCode: number): Promise<number> {
        return this.checkoutReservationService.expirePayOSOrder(orderCode);
    }
}
