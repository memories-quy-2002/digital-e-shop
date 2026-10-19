import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { AuthGuard } from "../guards/auth.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { LoyaltyService } from "./loyalty.service";

type AuthenticatedRequest = Request & { user?: { id?: string | number } };

@Controller("loyalty")
@UseGuards(AuthGuard)
export class LoyaltyController {
    constructor(private readonly loyalty: LoyaltyService) {}

    @Get("me")
    async getMine(@Req() req: AuthenticatedRequest) {
        try {
            const customerId = String(req.user?.id || "");
            return { loyalty: await this.loyalty.getOverview(customerId), msg: "Loyalty account retrieved successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve loyalty account");
        }
    }

    @Post("rewards/:promotionId/claim")
    @HttpCode(201)
    async claim(@Req() req: AuthenticatedRequest, @Param("promotionId", new ZodValidationPipe(z.coerce.number().int().positive())) promotionId: number) {
        try {
            const customerId = String(req.user?.id || "");
            return { ...await this.loyalty.claimReward(customerId, promotionId), msg: "Loyalty voucher claimed successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to claim loyalty reward");
        }
    }
}
