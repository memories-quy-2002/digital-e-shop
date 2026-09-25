import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { PaymentReconciliationService } from "./payment-reconciliation.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { PAYMENT_PROVIDER, PAYMENT_RECONCILIATION_STATUS } from "./payment.types";
import { PAYMENT_RECONCILIATION_LIMIT } from "./payment-reconciliation.constants";
import { createHttpException } from "#src/core/errors/http-exception";

const positiveInteger = z.coerce.number().int().positive();
export const paymentReconciliationQuerySchema = z.object({
    provider: z.enum([PAYMENT_PROVIDER.CASH, PAYMENT_PROVIDER.PAYOS]).optional(),
    reconciliationStatus: z.enum([
        PAYMENT_RECONCILIATION_STATUS.PENDING,
        PAYMENT_RECONCILIATION_STATUS.MATCHED,
        PAYMENT_RECONCILIATION_STATUS.MISMATCH,
        PAYMENT_RECONCILIATION_STATUS.UNAVAILABLE,
        PAYMENT_RECONCILIATION_STATUS.MANUAL_CONFIRMED,
    ]).optional(),
    page: positiveInteger.optional(),
    limit: positiveInteger.optional(),
}).strict();
export const reconciliationRunSchema = z.object({ limit: positiveInteger.optional() }).strict();
export const confirmCodSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();

type AdminRequest = Request & { user?: { id?: string | number } };

const paymentIdFrom = (value: string): number => {
    const paymentId = Number(value);
    if (!Number.isSafeInteger(paymentId) || paymentId < 1) throw new HttpException({ msg: "Payment id must be a positive integer" }, HTTP_STATUS.BAD_REQUEST);
    return paymentId;
};

const toHttpException = (error: unknown, fallback: string): HttpException => {
    if (error instanceof HttpException) return error;
    const statusCode = Number((error as { statusCode?: number })?.statusCode) || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const errorMessage = (error as { message?: string })?.message;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallback : errorMessage || fallback;
    return createHttpException(error, { msg }, statusCode);
};

@Controller("admin/payments")
export class AdminPaymentsController {
    constructor(private readonly service: PaymentReconciliationService) {}

    @Get("reconciliation")
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async listReconciliation(
        @Query(new ZodValidationPipe(paymentReconciliationQuerySchema)) query: Record<string, unknown>,
        @Req() req: AdminRequest,
    ) {
        try {
            const result = await this.service.listCandidates(query as never);
            return buildSuccessResponse({ ...result, msg: "Payment reconciliation candidates retrieved successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve payment reconciliation candidates");
        }
    }

    @Post("reconciliation/run")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async runReconciliation(
        @Body(new ZodValidationPipe(reconciliationRunSchema)) body: { limit?: number },
        @Req() req: AdminRequest,
    ) {
        try {
            const limit = Math.min(PAYMENT_RECONCILIATION_LIMIT.MAX, Math.max(1, Math.floor(Number(body.limit) || PAYMENT_RECONCILIATION_LIMIT.DEFAULT)));
            const result = await this.service.runReconciliation({ limit, requestedBy: String(req.user?.id || "") });
            return buildSuccessResponse({ ...result, msg: "Payment reconciliation run completed successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to run payment reconciliation");
        }
    }

    @Post(":paymentId/reconcile")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async reconcilePayment(@Param("paymentId") paymentId: string, @Req() req: AdminRequest) {
        try {
            const result = await this.service.reconcilePayment(paymentIdFrom(paymentId), String(req.user?.id || ""));
            return buildSuccessResponse({ result, msg: "Payment reconciliation completed successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to reconcile payment");
        }
    }

    @Post(":paymentId/confirm-cod")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async confirmCod(
        @Param("paymentId") paymentId: string,
        @Body(new ZodValidationPipe(confirmCodSchema)) body: { note?: string },
        @Req() req: AdminRequest,
    ) {
        try {
            const payment = await this.service.confirmCod(paymentIdFrom(paymentId), { note: body.note?.trim() }, String(req.user?.id || ""));
            return buildSuccessResponse({ payment, msg: "COD payment confirmed successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to confirm COD payment");
        }
    }

    @Get(":paymentId/webhook-events")
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async getWebhookEvents(@Param("paymentId") paymentId: string, @Req() req: AdminRequest) {
        try {
            const events = await this.service.listWebhookEvents(paymentIdFrom(paymentId));
            return buildSuccessResponse({ events, msg: "Payment webhook events retrieved successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve payment webhook events");
        }
    }
}
