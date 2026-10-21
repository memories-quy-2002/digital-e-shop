import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";
import type { CreateSupplierInput, SupplierActionInput, UpdateSupplierInput } from "./suppliers.types";
import { createSupplierSchema, supplierActionSchema, supplierIdSchema, suppliersQuerySchema, updateSupplierSchema } from "./suppliers.validator";

type AuthenticatedRequest = Request & { user?: { id?: string | number } };

@Controller("admin/suppliers")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class SuppliersController {
    constructor(private readonly service: SuppliersService) {}

    @Get()
    async list(@Query(new ZodValidationPipe(suppliersQuerySchema)) query: { page: number; limit: number; search: string; status: string }) {
        const result = await this.service.list(query);
        return { suppliers: result.items, pagination: result.pagination, msg: "Suppliers retrieved successfully" };
    }

    @Get(":id")
    async get(@Param("id", new ZodValidationPipe(supplierIdSchema)) id: number) {
        return { supplier: await this.service.get(id), msg: "Supplier retrieved successfully" };
    }

    @Post()
    async create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput) {
        return { supplier: await this.service.create(String(req.user?.id || ""), body), msg: "Supplier created successfully" };
    }

    @Patch(":id")
    async update(
        @Req() req: AuthenticatedRequest,
        @Param("id", new ZodValidationPipe(supplierIdSchema)) id: number,
        @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput,
    ) {
        return { supplier: await this.service.update(String(req.user?.id || ""), id, body), msg: "Supplier updated successfully" };
    }

    @Post(":id/archive")
    async archive(
        @Req() req: AuthenticatedRequest,
        @Param("id", new ZodValidationPipe(supplierIdSchema)) id: number,
        @Body(new ZodValidationPipe(supplierActionSchema)) body: SupplierActionInput,
    ) {
        return { supplier: await this.service.archive(String(req.user?.id || ""), id, body), msg: "Supplier archived successfully" };
    }
}
