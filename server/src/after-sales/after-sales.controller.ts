import { Body, Controller, Get, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesCreateSchema, afterSalesListQuerySchema } from "./after-sales.validator";
import type { AfterSalesCreateInput, AfterSalesListQuery } from "./after-sales.types";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

const userIdFrom = (req: AuthenticatedRequest) => String(req.user?.id || "");
const toHttpException = (error: unknown, fallbackMessage: string) => {
    if (error instanceof HttpException) return error;
    const typed = error as { statusCode?: number; message?: string };
    const statusCode = typed.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : typed.message || fallbackMessage;
    return createHttpException(error, { msg }, statusCode);
};

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
            throw toHttpException(error, "Unable to create after-sales request");
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
            throw toHttpException(error, "Unable to retrieve after-sales requests");
        }
    }

    @Get(":id")
    async detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
        try {
            const request = await this.service.getCustomerRequest(userIdFrom(req), Number(id));
            return { request, msg: "After-sales request retrieved successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve after-sales request");
        }
    }
}
