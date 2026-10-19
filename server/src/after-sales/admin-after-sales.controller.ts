import { Body, Controller, Get, GoneException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { parseResourceId } from "#src/shared/utils/public-id";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { ManualRefundService, manualRefundInputSchema, type ManualRefundInput } from "./manual-refund.service";
import { afterSalesListQuerySchema, afterSalesStatusSchema } from "./after-sales.validator";
import type { AfterSalesListQuery, AfterSalesStatusTransition } from "./after-sales.types";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

@Controller("admin/after-sales/requests")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminAfterSalesController {
    constructor(private readonly service: AfterSalesService, private readonly manualRefunds: ManualRefundService) {}

    @Post(":id/manual-refund")
    async manualRefund(@Param("id") id: string, @Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(manualRefundInputSchema)) body: ManualRefundInput) {
        try {
            const requestId = parseResourceId(id);
            await this.manualRefunds.confirm(requestId, String(req.user?.id || ""), body);
            const request = await this.service.getAdminRequest(requestId);
            return { request, msg: "Manual refund transfer recorded" };
        } catch (error) { throw mapToHttpException(error, "Unable to record manual refund"); }
    }

    @Get()
    async list(@Query(new ZodValidationPipe(afterSalesListQuerySchema)) query: AfterSalesListQuery) {
        try {
            return await this.service.listAdminRequests(query);
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve after-sales requests");
        }
    }

    @Get(":id")
    async detail(@Param("id") id: string) {
        try {
            const request = await this.service.getAdminRequest(parseResourceId(id));
            return { request, msg: "After-sales request retrieved successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve after-sales request");
        }
    }

    @Patch(":id/status")
    async transition(
        @Param("id") id: string,
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(afterSalesStatusSchema)) body: AfterSalesStatusTransition,
    ) {
        try {
            const request = await this.service.transitionRequest(parseResourceId(id), String(req.user?.id || ""), body);
            return { request, msg: "After-sales request status updated successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to update after-sales request status");
        }
    }

    @Post(":id/refund")
    async refund() {
        throw new GoneException("Use the evidence-backed manual-refund endpoint.");
    }
}
