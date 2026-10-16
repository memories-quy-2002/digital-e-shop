import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { USER_ROLE } from "../shared/constants/user";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestUsersService } from "../users/users.service";
import { deliverySettingsSchema } from "./delivery-settings.validator";
import { DeliverySettingsService } from "./delivery-settings.service";
import { DeliveryAssignmentService } from "./delivery-assignment.service";
import { deliveryAssignmentSchema } from "./delivery.validator";

const orderIdSchema = z.coerce.number().int().positive();

@Controller("admin/delivery")
@UseGuards(AuthGuard, RolesGuard)
@Roles(USER_ROLE.ADMIN)
export class AdminDeliveryController {
    constructor(
        private readonly settings: DeliverySettingsService,
        private readonly assignments: DeliveryAssignmentService,
        private readonly users: NestUsersService,
    ) {}

    @Get("settings")
    async getSettings() {
        return { settings: await this.settings.get() };
    }

    @Put("settings")
    async updateSettings(@Body(new ZodValidationPipe(deliverySettingsSchema)) body: Parameters<DeliverySettingsService["update"]>[0], @Req() req: Request) {
        return { settings: await this.settings.update(body, String(req.user?.id || "")) };
    }

    @Get("assignable-orders")
    async listAssignableOrders() {
        return { orders: await this.assignments.listAssignableOrders() };
    }

    @Get("orders/:orderId")
    async orderHistory(@Param("orderId") rawOrderId: string) {
        return { assignments: await this.assignments.assignmentHistory(orderIdSchema.parse(rawOrderId)) };
    }

    @Get("staff")
    async listStaff() {
        return { staff: await this.users.getActiveDeliveryStaff() };
    }

    @Post("orders/:orderId/assignments")
    assign(
        @Param("orderId") rawOrderId: string,
        @Body(new ZodValidationPipe(deliveryAssignmentSchema)) body: { employeeId: string; scheduledStartAt: Date; scheduledEndAt: Date },
        @Req() req: Request,
    ) {
        const orderId = orderIdSchema.parse(rawOrderId);
        return this.assignments.assign({ ...body, orderId }, String(req.user?.id || ""));
    }
}
