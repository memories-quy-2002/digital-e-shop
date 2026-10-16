import { Body, Controller, Get, HttpException, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { AdminAlertsService } from "./admin-alerts.service";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { acknowledgeAdminAlertsSchema, updateAdminAlertTriageSchema } from "./admin-alerts.validator";

@Controller("admin/alerts")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminAlertsController {
    constructor(private readonly service: AdminAlertsService) {}

    @Get()
    async getAlerts(@Req() req: Request & { user?: { id?: string | number } }) {
        try {
            const alerts = await this.service.getAlerts(String(req.user?.id || ""));
            return { alerts, unread: alerts.filter((alert) => alert.unread).length, msg: "Admin alerts retrieved successfully" };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw createHttpException(error, { msg: "Unable to load admin alerts" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }

    @Put("acknowledge")
    async acknowledgeAlerts(
        @Req() req: Request & { user?: { id?: string | number } },
        @Body(new ZodValidationPipe(acknowledgeAdminAlertsSchema)) body: { alertIds: string[] },
    ) {
        try {
            await this.service.acknowledgeAlerts(String(req.user?.id || ""), body.alertIds);
            return { acknowledged: body.alertIds.length, msg: "Admin alerts marked as read" };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw createHttpException(error, { msg: "Unable to update admin alerts" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }

    @Put("triage")
    async updateAlertTriage(
        @Req() req: Request & { user?: { id?: string | number } },
        @Body(new ZodValidationPipe(updateAdminAlertTriageSchema)) body: { alertId: string; action: "claim" | "release" | "resolve" | "reopen" },
    ) {
        try {
            const triage = await this.service.updateTriage(String(req.user?.id || ""), body.alertId, body.action);
            return { triage, msg: "Admin alert triage updated successfully" };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw createHttpException(error, { msg: "Unable to update admin alert triage" }, HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }
    }
}
