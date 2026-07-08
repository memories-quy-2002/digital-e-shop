import { Controller, Get, Query, HttpCode, HttpException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { NestAnalyticsService } from "./analytics.service";
import { logger } from "#src/shared/utils/logger";

@Controller("analytics")
export class AnalyticsController {
    constructor(private readonly analyticsService: NestAnalyticsService) {}

    @Get("summary")
    @HttpCode(200)
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async getAnalyticsSummary(@Query() query: Record<string, unknown>) {
        try {
            return await this.analyticsService.getAnalyticsSummary(query);
        } catch (err) {
            logger.error(err);
            throw new HttpException({ msg: "Unable to load analytics summary" }, 500);
        }
    }
}
