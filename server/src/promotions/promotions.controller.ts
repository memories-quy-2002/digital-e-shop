import { Body, Controller, Delete, Get, HttpCode, HttpException, Param, Post, Put, UseGuards } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestPromotionsService } from "./promotions.service";

import { promotionSchema } from "./promotions.validator";
import { createHttpException } from "#src/core/errors/http-exception";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    if (err instanceof HttpException) return err;
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : err.message || fallbackMessage;
    return createHttpException(err, { msg }, statusCode);
}

@Controller("promotions")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class PromotionsController {
    constructor(private readonly promotionsService: NestPromotionsService) {}

    @Get()
    async getPromotions() {
        try {
            const promotions = await this.promotionsService.getPromotions();
            return { promotions, msg: "Promotions retrieved successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to retrieve promotions");
        }
    }

    @Post()
    @HttpCode(HTTP_STATUS.CREATED)
    async createPromotion(@Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.createPromotion(body);
            return { promotion, msg: "Promotion created successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to create promotion");
        }
    }

    @Put(":id")
    @HttpCode(HTTP_STATUS.OK)
    async updatePromotion(@Param("id") id: string, @Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.updatePromotion(id, body);
            return { promotion, msg: "Promotion updated successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to update promotion");
        }
    }

    @Delete(":id")
    @HttpCode(HTTP_STATUS.OK)
    async deletePromotion(@Param("id") id: string) {
        try {
            const promotion = await this.promotionsService.deletePromotion(id);
            return { promotion, msg: "Promotion deactivated successfully" };
        } catch (err) {
            throw toHttpException(err as Error, "Unable to deactivate promotion");
        }
    }
}
