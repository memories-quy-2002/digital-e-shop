import { Body, Controller, Headers, HttpCode, HttpException, Optional, Param, Post, Req, Res, ForbiddenException } from "@nestjs/common";
import type { Request, Response } from "express";
import { GUEST_CART_COOKIE, isGuestCartId } from "../cart/guest-cart";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import { NestOrdersService } from "./orders.service";
import { NestOrdersPayOSService } from "./orders.payos.service";
import { PaymentReconciliationService } from "../payments/payment-reconciliation.service";
import type { GuestOrderLookupPayload, GuestPurchasePayload, GuestPayOSCheckoutPayload, GuestPayOSOrderLookupPayload } from "./orders.dto";
import { guestOrderLookupSchema, guestPurchaseSchema, guestPayOSCheckoutSchema, guestPayOSOrderLookupSchema, paymentAttemptIdSchema, paymentAttemptIdempotencyKeySchema } from "./orders.validator";

@Controller("orders")
export class GuestOrdersController {
    constructor(
        private readonly ordersService: NestOrdersService,
        @Optional() private readonly ordersPayOSService?: NestOrdersPayOSService,
        @Optional() private readonly paymentReconciliationService?: PaymentReconciliationService,
    ) {}

    private requireGuestIdentity(req: Request): string {
        const guestCartId = req?.cookies?.[GUEST_CART_COOKIE];
        if (req?.cookies?.accessToken || !isGuestCartId(guestCartId)) throw new ForbiddenException("Refresh cart identity before checkout");
        return guestCartId;
    }

    @Post("/guest/payment-attempts/:attemptId/status")
    async getGuestPaymentAttemptStatus(
        @Param("attemptId", new ZodValidationPipe(paymentAttemptIdSchema)) attemptId: string,
        @Req() req: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        if (!this.paymentReconciliationService) throw new HttpException({ msg: "Payment attempt status is unavailable" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
        const guestCartId = this.requireGuestIdentity(req);
        response.setHeader("Cache-Control", "no-store");
        const status = await this.paymentReconciliationService.getOwnedAttemptStatus(attemptId, { kind: "guest", guestCartId });
        return { paymentAttempt: status, msg: "Payment attempt status retrieved successfully" };
    }

    @Post("/guest/payment-attempts/:attemptId/reconcile")
    @HttpCode(202)
    async reconcileGuestPaymentAttempt(
        @Param("attemptId", new ZodValidationPipe(paymentAttemptIdSchema)) attemptId: string,
        @Req() req: Request,
    ) {
        if (!this.paymentReconciliationService) throw new HttpException({ msg: "Payment attempt recovery is unavailable" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
        const guestCartId = this.requireGuestIdentity(req);
        const result = await this.paymentReconciliationService.requestOwnedReconciliation(attemptId, { kind: "guest", guestCartId });
        return { ...result, msg: "Payment reconciliation was scheduled" };
    }

    @Post("/guest/payment-attempts/:attemptId/cancel")
    @HttpCode(202)
    async cancelGuestPaymentAttempt(
        @Param("attemptId", new ZodValidationPipe(paymentAttemptIdSchema)) attemptId: string,
        @Req() req: Request,
    ) {
        if (!this.paymentReconciliationService) throw new HttpException({ msg: "Payment attempt cancellation is unavailable" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
        const guestCartId = this.requireGuestIdentity(req);
        const result = await this.paymentReconciliationService.requestOwnedCancellation(attemptId, { kind: "guest", guestCartId });
        if (!result.accepted) {
            throw new HttpException({ msg: "This payment attempt already belongs to a committed order. Use the order cancellation and audited refund flow." }, HTTP_STATUS.CONFLICT);
        }
        return { ...result, msg: "Payment cancellation was scheduled" };
    }

    @Post("/guest/purchase")
    @HttpCode(HTTP_STATUS.CREATED)
    async makeGuestPurchase(
        @Body(new ZodValidationPipe(guestPurchaseSchema)) body: GuestPurchasePayload,
        @Req() req: Request,
    ) {
        try {
            const guestCartId = req?.cookies?.[GUEST_CART_COOKIE];
            if (req?.cookies?.accessToken || !isGuestCartId(guestCartId)) throw new ForbiddenException("Refresh cart identity before checkout");
            const result = await this.ordersService.makeGuestPurchase(body, guestCartId);
            return {
                orderId: result.order.id,
                order: result.order,
                guestOrderToken: result.guestOrderToken,
                paymentMethod: body.paymentMethod,
                msg: `Order has been created successfully with id = ${result.order.id}`,
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to place order right now" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async lookupGuestOrder(
        @Body(new ZodValidationPipe(guestOrderLookupSchema)) body: GuestOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.lookupGuestOrder(body.orderId, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }

    @Post("/guest/payos-checkout-session")
    @HttpCode(HTTP_STATUS.OK)
    async createGuestPayOSCheckoutSession(
        @Body(new ZodValidationPipe(guestPayOSCheckoutSchema)) body: GuestPayOSCheckoutPayload,
        @Req() req: Request,
        @Headers("idempotency-key", new ZodValidationPipe(paymentAttemptIdempotencyKeySchema.optional())) idempotencyKey?: string,
    ) {
        try {
            if (!this.ordersPayOSService) throw new HttpException({ msg: "PayOS checkout is not configured" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
            const guestCartId = this.requireGuestIdentity(req);
            const result = await this.ordersPayOSService.createGuestCheckoutSession(body, guestCartId, idempotencyKey);
            return {
                attemptId: result.attemptId,
                sessionState: result.sessionState,
                url: result.url,
                orderCode: result.orderCode,
                paymentLinkId: result.paymentLinkId,
                amount: result.amount,
                currency: result.currency,
                guestOrderToken: result.guestOrderToken,
                msg: "PayOS checkout session created",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to start guest PayOS checkout" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/by-payos-order-code")
    @HttpCode(HTTP_STATUS.OK)
    async getGuestOrderByPayOSOrderCode(
        @Body(new ZodValidationPipe(guestPayOSOrderLookupSchema)) body: GuestPayOSOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.getGuestOrderByPayOSOrderCode(body.orderCode, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }
}
