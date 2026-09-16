import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

const positiveInteger = z.coerce.number().int().positive();
export const paymentReconciliationQuerySchema = z.object({
    provider: z.enum(["cash", "payos"]).optional(),
    reconciliationStatus: z.enum(["PENDING", "MATCHED", "MISMATCH", "UNAVAILABLE", "MANUAL_CONFIRMED"]).optional(),
    page: positiveInteger.optional(),
    limit: positiveInteger.optional(),
}).strict();
export const reconciliationRunSchema = z.object({ limit: positiveInteger.optional() }).strict();
export const confirmCodSchema = z.object({ note: z.string().trim().max(500).optional() }).strict();

type AdminRequest = Request & { user?: { id?: string | number } };

const paymentIdFrom = (value: string): number => {
    const paymentId = Number(value);
    if (!Number.isSafeInteger(paymentId) || paymentId < 1) throw new HttpException({ msg: "Payment id must be a positive integer" }, 400);
    return paymentId;
};

const toHttpException = (error: unknown, fallback: string): HttpException => {
    const statusCode = Number((error as { statusCode?: number })?.statusCode) || 500;
    return new HttpException({ msg: statusCode === 500 ? fallback : (error as Error).message }, statusCode);
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
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async runReconciliation(
        @Body(new ZodValidationPipe(reconciliationRunSchema)) body: { limit?: number },
        @Req() req: AdminRequest,
    ) {
        try {
            const limit = Math.min(100, Math.max(1, Math.floor(Number(body.limit) || 50)));
            const result = await this.service.runReconciliation({ limit, requestedBy: String(req.user?.id || "") });
            return buildSuccessResponse({ ...result, msg: "Payment reconciliation run completed successfully" }, requestIdFrom(req));
        } catch (error) {
            throw toHttpException(error, "Unable to run payment reconciliation");
        }
    }

    @Post(":paymentId/reconcile")
    @HttpCode(200)
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
    @HttpCode(200)
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
