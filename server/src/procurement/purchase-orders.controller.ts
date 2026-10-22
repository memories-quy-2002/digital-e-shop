import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { PurchaseOrdersService } from "./purchase-orders.service";
import type { CreatePurchaseOrderInput, DocumentActionInput, UpdatePurchaseOrderInput } from "./purchase-orders.types";
import { cancelPurchaseOrderSchema, closePurchaseOrderSchema, createPurchaseOrderSchema, documentActionSchema, purchaseOrderIdSchema, purchaseOrdersQuerySchema, updatePurchaseOrderSchema } from "./purchase-orders.validator";

type AuthenticatedRequest = Request & { user?: { id?: string | number } };

@Controller("admin/purchase-orders")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class PurchaseOrdersController {
    constructor(private readonly service: PurchaseOrdersService) {}

    @Get()
    async list(@Query(new ZodValidationPipe(purchaseOrdersQuerySchema)) query: { page: number; limit: number; search: string; status: string; supplierId?: number }) {
        const result = await this.service.list(query);
        return { orders: result.items, pagination: result.pagination, msg: "Purchase orders retrieved successfully" };
    }

    @Get(":id")
    async get(@Param("id", new ZodValidationPipe(purchaseOrderIdSchema)) id: number) {
        return { order: await this.service.get(id), msg: "Purchase order retrieved successfully" };
    }

    @Post()
    async create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(createPurchaseOrderSchema)) body: CreatePurchaseOrderInput) {
        return { order: await this.service.create(String(req.user?.id || ""), body), msg: "Purchase order created successfully" };
    }

    @Patch(":id")
    async updateDraft(
        @Req() req: AuthenticatedRequest,
        @Param("id", new ZodValidationPipe(purchaseOrderIdSchema)) id: number,
        @Body(new ZodValidationPipe(updatePurchaseOrderSchema)) body: UpdatePurchaseOrderInput,
    ) {
        return { order: await this.service.updateDraft(String(req.user?.id || ""), id, body), msg: "Purchase order updated successfully" };
    }

    @Post(":id/confirm")
    async confirm(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(purchaseOrderIdSchema)) id: number, @Body(new ZodValidationPipe(documentActionSchema)) body: DocumentActionInput) {
        return { order: await this.service.transition(String(req.user?.id || ""), id, "confirm", body), msg: "Purchase order confirmed successfully" };
    }

    @Post(":id/cancel")
    async cancel(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(purchaseOrderIdSchema)) id: number, @Body(new ZodValidationPipe(cancelPurchaseOrderSchema)) body: DocumentActionInput) {
        return { order: await this.service.transition(String(req.user?.id || ""), id, "cancel", body), msg: "Purchase order canceled successfully" };
    }

    @Post(":id/close")
    async close(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(purchaseOrderIdSchema)) id: number, @Body(new ZodValidationPipe(closePurchaseOrderSchema)) body: DocumentActionInput) {
        return { order: await this.service.transition(String(req.user?.id || ""), id, "close", body), msg: "Purchase order closed successfully" };
    }
}
