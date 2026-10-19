import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesCreateSchema, afterSalesListQuerySchema } from "./after-sales.validator";
import type { AfterSalesCreateInput, AfterSalesListQuery } from "./after-sales.types";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { parseResourceId } from "#src/shared/utils/public-id";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

const userIdFrom = (req: AuthenticatedRequest) => String(req.user?.id || "");
@Controller("after-sales/requests")
@UseGuards(AuthGuard, RolesGuard)
@Roles("customer", "admin")
export class AfterSalesController {
    constructor(private readonly service: AfterSalesService) {}

    @Post()
    async create(
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(afterSalesCreateSchema)) body: AfterSalesCreateInput,
    ) {
        try {
            const request = await this.service.createCustomerRequest(userIdFrom(req), body);
            return { request, msg: "After-sales request created successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to create after-sales request");
        }
    }

    @Get()
    async list(
        @Req() req: AuthenticatedRequest,
        @Query(new ZodValidationPipe(afterSalesListQuerySchema)) query: AfterSalesListQuery,
    ) {
        try {
            return await this.service.listCustomerRequests(userIdFrom(req), query);
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve after-sales requests");
        }
    }

    @Get(":id")
    async detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
        try {
            const request = await this.service.getCustomerRequest(userIdFrom(req), parseResourceId(id));
            return { request, msg: "After-sales request retrieved successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve after-sales request");
        }
    }
}
