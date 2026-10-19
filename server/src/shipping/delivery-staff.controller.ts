import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { USER_ROLE } from "../shared/constants/user";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { DeliveryAssignmentService } from "./delivery-assignment.service";
import { deliveryStatusUpdateSchema } from "./delivery.validator";

const assignmentIdSchema = z.coerce.number().int().positive();

@Controller("delivery/staff/assignments")
@UseGuards(AuthGuard, RolesGuard)
@Roles(USER_ROLE.DELIVERY_STAFF)
export class DeliveryStaffController {
    constructor(private readonly assignments: DeliveryAssignmentService) {}

    @Get()
    async list(@Req() req: Request) {
        return { assignments: await this.assignments.listForStaff(String(req.user?.id || "")) };
    }

    @Get(":id")
    detail(@Param("id") rawId: string, @Req() req: Request) {
        return this.assignments.getForStaff(assignmentIdSchema.parse(rawId), String(req.user?.id || ""));
    }

    @Post(":id/status")
    update(
        @Param("id") rawId: string,
        @Req() req: Request,
        @Body(new ZodValidationPipe(deliveryStatusUpdateSchema)) body: Parameters<DeliveryAssignmentService["transition"]>[0],
    ) {
        return this.assignments.transition({ ...body, assignmentId: assignmentIdSchema.parse(rawId), employeeId: String(req.user?.id || "") });
    }
}
