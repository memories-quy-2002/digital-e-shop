import { Controller, Get, HttpException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { AdminAlertsService } from "./admin-alerts.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";

@Controller("admin/alerts")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminAlertsController {
    constructor(private readonly service: AdminAlertsService) {}

    @Get()
    async getAlerts() {
        try {
            const alerts = await this.service.getAlerts();
            return { alerts, unread: alerts.filter((alert) => alert.unread).length, msg: "Admin alerts retrieved successfully" };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw createHttpException(error, { msg: "Unable to load admin alerts" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }
}
