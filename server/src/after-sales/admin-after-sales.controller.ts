import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesListQuerySchema, afterSalesStatusSchema, refundConfirmationSchema } from "./after-sales.validator";
import type { AfterSalesListQuery, AfterSalesStatusTransition, RefundConfirmationInput } from "./after-sales.types";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

const toHttpException = (error: unknown, fallbackMessage: string) => {
    if (error instanceof HttpException) return error;
    const typed = error as { statusCode?: number; message?: string };
    const statusCode = typed.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : typed.message || fallbackMessage;
    return createHttpException(error, { msg }, statusCode);
};

@Controller("admin/after-sales/requests")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminAfterSalesController {
    constructor(private readonly service: AfterSalesService) {}

    @Get()
    async list(@Query(new ZodValidationPipe(afterSalesListQuerySchema)) query: AfterSalesListQuery) {
        try {
            return await this.service.listAdminRequests(query);
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve after-sales requests");
        }
    }

    @Get(":id")
    async detail(@Param("id") id: string) {
        try {
            const request = await this.service.getAdminRequest(Number(id));
            return { request, msg: "After-sales request retrieved successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve after-sales request");
        }
    }

    @Patch(":id/status")
    async transition(
        @Param("id") id: string,
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(afterSalesStatusSchema)) body: AfterSalesStatusTransition,
    ) {
        try {
            const request = await this.service.transitionRequest(Number(id), String(req.user?.id || ""), body);
            return { request, msg: "After-sales request status updated successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to update after-sales request status");
        }
    }

    @Post(":id/refund")
    async refund(
        @Param("id") id: string,
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(refundConfirmationSchema)) body: RefundConfirmationInput,
    ) {
        try {
            const request = await this.service.confirmRefund(Number(id), String(req.user?.id || ""), body);
            return { request, msg: "After-sales refund confirmed successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to confirm after-sales refund");
        }
    }
}
