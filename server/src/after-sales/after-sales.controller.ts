import { Body, Controller, Get, HttpException, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesCreateSchema, afterSalesListQuerySchema } from "./after-sales.validator";
import type { AfterSalesCreateInput, AfterSalesListQuery } from "./after-sales.types";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

const userIdFrom = (req: AuthenticatedRequest) => String(req.user?.id || "");
const toHttpException = (error: unknown) => {
    const typed = error as { statusCode?: number; message?: string };
    return new HttpException({ msg: typed.statusCode ? typed.message : "Unable to process after-sales request" }, typed.statusCode || 500);
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
            throw toHttpException(error);
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
            throw toHttpException(error);
        }
    }

    @Get(":id")
    async detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
        try {
            const request = await this.service.getCustomerRequest(userIdFrom(req), Number(id));
            return { request, msg: "After-sales request retrieved successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }
}
