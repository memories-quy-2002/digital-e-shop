import { Body, Controller, Get, Query, HttpCode, HttpException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { CodSettlementService } from "./cod-settlement.service";
import { settlementInputSchema, type SettlementInput } from "./cod-settlement.validator";

type AdminRequest = Request & { user?: { id?: string | number } };
const positiveId = (value: string) => {
    const id = Number(value);
    if (!Number.isSafeInteger(id) || id < 1) throw new HttpException({ msg: "Order id must be a positive integer" }, HTTP_STATUS.BAD_REQUEST);
    return id;
};

@Controller("admin/payments/cod-settlements")
export class AdminCodSettlementsController {
    constructor(private readonly service: CodSettlementService) {}

    @Get() @UseGuards(AuthGuard, RolesGuard) @Roles("admin")
    async list(@Query() query: { limit?: string; afterId?: string }) {
        const limit = query.limit === undefined ? 20 : Number(query.limit);
        const afterId = query.afterId === undefined ? 0 : Number(query.afterId);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(afterId) || afterId < 0) throw new HttpException({ msg: "Invalid settlement pagination" }, 400);
        const settlements = await this.service.list(limit, afterId);
        return { settlements, nextAfterId: settlements.length === limit ? settlements.at(-1)?.id : null };
    }

    @Post(":orderId/remittance")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async recordRemittance(
        @Param("orderId") orderId: string,
        @Body(new ZodValidationPipe(settlementInputSchema)) body: SettlementInput,
        @Req() req: AdminRequest,
    ) {
        try {
            const settlement = await this.service.recordRemittance(positiveId(orderId), String(req.user?.id || ""), body);
            return buildSuccessResponse({ settlement, msg: "COD remittance recorded successfully" }, requestIdFrom(req));
        } catch (error) {
            throw mapToHttpException(error, "Unable to record COD remittance");
        }
    }
}
