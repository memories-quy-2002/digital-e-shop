import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { PurchaseReceiptsService } from "./purchase-receipts.service";
import type { PostReceiptInput } from "./purchase-receipts.types";
import { postReceiptSchema, receiptListQuerySchema, receiptOrderIdSchema } from "./purchase-receipts.validator";

type AuthenticatedRequest = Request & { user?: { id?: string | number } };

@Controller("admin/purchase-orders/:id/receipts")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class PurchaseReceiptsController {
    constructor(private readonly service: PurchaseReceiptsService) {}

    @Get()
    async list(
        @Param("id", new ZodValidationPipe(receiptOrderIdSchema)) orderId: number,
        @Query(new ZodValidationPipe(receiptListQuerySchema)) query: { page: number; limit: number },
    ) {
        const result = await this.service.list(orderId, query);
        return { receipts: result.items, pagination: result.pagination, msg: "Purchase receipts retrieved successfully" };
    }

    @Post()
    async post(
        @Req() req: AuthenticatedRequest,
        @Param("id", new ZodValidationPipe(receiptOrderIdSchema)) orderId: number,
        @Body(new ZodValidationPipe(postReceiptSchema)) body: PostReceiptInput,
    ) {
        return { receipt: await this.service.post(String(req.user?.id || ""), orderId, body), msg: "Purchase receipt posted successfully" };
    }
}
