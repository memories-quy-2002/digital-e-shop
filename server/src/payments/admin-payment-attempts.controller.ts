import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import {
    adminPaymentAttemptQueueQuerySchema,
    adminPaymentAttemptRefundSchema,
    adminPaymentAttemptRetrySchema,
} from "./admin-payment-attempts.validator";
import type {
    AdminPaymentAttemptQueueQuery,
    AdminPaymentAttemptRefundBody,
    AdminPaymentAttemptRetryBody,
} from "./admin-payment-attempts.validator";
import { AdminPaymentAttemptsService } from "./admin-payment-attempts.service";

type AdminRequest = Request & { user?: { id?: string | number } };
const attemptIdFrom = (value: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw Object.assign(new Error("Payment attempt id must be a UUID"), { statusCode: HTTP_STATUS.BAD_REQUEST });
    }
    return value;
};

@Controller("admin/payments/attempt-exceptions")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminPaymentAttemptsController {
    constructor(private readonly service: AdminPaymentAttemptsService) {}

    @Get()
    @Header("Cache-Control", "no-store")
    async list(@Query(new ZodValidationPipe(adminPaymentAttemptQueueQuerySchema)) query: AdminPaymentAttemptQueueQuery, @Req() req: AdminRequest) {
        try {
            const result = await this.service.listExceptions(query);
            return buildSuccessResponse({ ...result, msg: "Paid payment exceptions retrieved successfully" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve paid payment exceptions");
        }
    }

    @Get(":attemptId")
    @Header("Cache-Control", "no-store")
    async get(@Param("attemptId") attemptId: string, @Req() req: AdminRequest) {
        try {
            const attempt = await this.service.getException(attemptIdFrom(attemptId));
            return buildSuccessResponse({ attempt, msg: "Paid payment exception retrieved successfully" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve paid payment exception");
        }
    }

    @Post(":attemptId/retry")
    @HttpCode(HTTP_STATUS.OK)
    async retry(
        @Param("attemptId") attemptId: string,
        @Body(new ZodValidationPipe(adminPaymentAttemptRetrySchema)) body: AdminPaymentAttemptRetryBody,
        @Req() req: AdminRequest,
    ) {
        try {
            const result = await this.service.retryFulfillment(attemptIdFrom(attemptId), String(req.user?.id || ""), body.reason);
            return buildSuccessResponse({ result, msg: "Payment fulfillment retry completed" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to retry payment fulfillment");
        }
    }

    @Post(":attemptId/refunds")
    @HttpCode(HTTP_STATUS.OK)
    async refund(
        @Param("attemptId") attemptId: string,
        @Body(new ZodValidationPipe(adminPaymentAttemptRefundSchema)) body: AdminPaymentAttemptRefundBody,
        @Req() req: AdminRequest,
    ) {
        try {
            const result = await this.service.recordRefund(attemptIdFrom(attemptId), String(req.user?.id || ""), {
                ...body,
                transferredAt: new Date(`${body.transferredAt}T00:00:00.000Z`),
            });
            return buildSuccessResponse({ refund: result, msg: "Manual refund recorded successfully" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to record manual refund");
        }
    }
}
