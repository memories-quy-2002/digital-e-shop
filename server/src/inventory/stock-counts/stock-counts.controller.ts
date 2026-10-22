import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../../guards/auth.guard";
import { Roles, RolesGuard } from "../../guards/roles.guard";
import { ZodValidationPipe } from "../../pipes/zod-validation.pipe";
import { StockCountsService } from "./stock-counts.service";
import type { CountActionInput, CreateStockCountInput, UpdateCountInput } from "./stock-counts.types";
import { cancelCountSchema, countActionSchema, createStockCountSchema, reopenCountSchema, stockCountIdSchema, stockCountsQuerySchema, updateStockCountSchema } from "./stock-counts.validator";
import type { z } from "zod";

type StockCountsQueryInput = z.infer<typeof stockCountsQuerySchema>;

type AuthenticatedRequest = Request & { user?: { id?: string | number } };

@Controller("admin/stock-counts")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class StockCountsController {
    constructor(private readonly service: StockCountsService) {}

    @Get()
    async list(@Query(new ZodValidationPipe(stockCountsQuerySchema)) query: StockCountsQueryInput) {
        const result = await this.service.list(query);
        return { counts: result.items, pagination: result.pagination, msg: "Stock counts retrieved successfully" };
    }

    @Get(":id")
    async get(@Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number) {
        return { count: await this.service.get(id), msg: "Stock count retrieved successfully" };
    }

    @Post()
    async create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(createStockCountSchema)) body: CreateStockCountInput) {
        return { count: await this.service.create(String(req.user?.id || ""), body), msg: "Stock count created successfully" };
    }

    @Patch(":id")
    async update(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number, @Body(new ZodValidationPipe(updateStockCountSchema)) body: UpdateCountInput) {
        return { count: await this.service.update(String(req.user?.id || ""), id, body), msg: "Stock count observations saved successfully" };
    }

    @Post(":id/submit")
    async submit(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number, @Body(new ZodValidationPipe(countActionSchema)) body: CountActionInput) {
        return { count: await this.service.transition(String(req.user?.id || ""), id, "submit", body), msg: "Stock count submitted successfully" };
    }

    @Post(":id/reopen")
    async reopen(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number, @Body(new ZodValidationPipe(reopenCountSchema)) body: CountActionInput) {
        return { count: await this.service.transition(String(req.user?.id || ""), id, "reopen", body), msg: "Selected stock count lines were reopened" };
    }

    @Post(":id/approve")
    async approve(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number, @Body(new ZodValidationPipe(countActionSchema)) body: CountActionInput) {
        return { count: await this.service.transition(String(req.user?.id || ""), id, "approve", body), msg: "Stock count approved successfully" };
    }

    @Post(":id/cancel")
    async cancel(@Req() req: AuthenticatedRequest, @Param("id", new ZodValidationPipe(stockCountIdSchema)) id: number, @Body(new ZodValidationPipe(cancelCountSchema)) body: CountActionInput) {
        return { count: await this.service.transition(String(req.user?.id || ""), id, "cancel", body), msg: "Stock count canceled successfully" };
    }
}
