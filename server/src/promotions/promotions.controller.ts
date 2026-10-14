import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, UseGuards } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestPromotionsService } from "./promotions.service";

import { promotionSchema } from "./promotions.validator";

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
            throw mapToHttpException(err, "Unable to retrieve promotions");
        }
    }

    @Post()
    @HttpCode(HTTP_STATUS.CREATED)
    async createPromotion(@Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.createPromotion(body);
            return { promotion, msg: "Promotion created successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to create promotion");
        }
    }

    @Put(":id")
    @HttpCode(HTTP_STATUS.OK)
    async updatePromotion(@Param("id") id: string, @Body(new ZodValidationPipe(promotionSchema)) body: Record<string, unknown>) {
        try {
            const promotion = await this.promotionsService.updatePromotion(id, body);
            return { promotion, msg: "Promotion updated successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to update promotion");
        }
    }

    @Delete(":id")
    @HttpCode(HTTP_STATUS.OK)
    async deletePromotion(@Param("id") id: string) {
        try {
            const promotion = await this.promotionsService.deletePromotion(id);
            return { promotion, msg: "Promotion deactivated successfully" };
        } catch (err) {
            throw mapToHttpException(err, "Unable to deactivate promotion");
        }
    }
}
