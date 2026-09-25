import { Controller, Get, Query, HttpCode, HttpException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { NestAnalyticsService } from "./analytics.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

@Controller("analytics")
export class AnalyticsController {
    constructor(private readonly analyticsService: NestAnalyticsService) {}

    @Get("summary")
    @HttpCode(HTTP_STATUS.OK)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async getAnalyticsSummary(@Query() query: Record<string, unknown>) {
        try {
            return await this.analyticsService.getAnalyticsSummary(query);
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw createHttpException(error, { msg: "Unable to load analytics summary" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }
}
