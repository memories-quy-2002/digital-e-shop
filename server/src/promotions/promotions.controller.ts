import { Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestPromotionsService } from "./promotions.service";

import { promotionSchema } from "./promotions.validator";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    const statusCode = err.statusCode || 500;
    const msg = err.statusCode ? err.message : fallbackMessage;
    return new HttpException({ msg }, statusCode);
}

@Controller("promotions")
@UseGuards(AuthGuard, RolesGuard)
export class PromotionsController {
    constructor(private readonly promotionsService: NestPromotionsService) {}

    @Get()
    async getPromotions() {
        try {
            const promotions = await this.promotionsService.getPromotions();
            return { promotions, msg: "Promotions retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Internal server error");
        }
    }

    @Post()
    @HttpCode(201)
    async createPromotion(@Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.createPromotion(body);
            return { promotion, msg: "Promotion created successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Internal server error");
        }
    }

    @Put(":id")
    @HttpCode(200)
    async updatePromotion(@Param("id") id: string, @Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.updatePromotion(id, body);
            return { promotion, msg: "Promotion updated successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Internal server error");
        }
    }

    @Delete(":id")
    @HttpCode(200)
    async deletePromotion(@Param("id") id: string) {
        try {
            const promotion = await this.promotionsService.deletePromotion(id);
            return { promotion, msg: "Promotion deactivated successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Internal server error");
        }
    }
}
