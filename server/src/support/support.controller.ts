import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { SupportTicketService } from "./support.service";
import type { UpdateSupportTicketInput } from "./support.types";
import { supportTicketCreateSchema, supportTicketQuerySchema, supportTicketUpdateSchema } from "./support.validator";

type AuthenticatedRequest = Request & { user?: { id?: string | number; role?: string } };

const userIdFrom = (req: AuthenticatedRequest) => String(req.user?.id || "");
const isAdmin = (req: AuthenticatedRequest) => String(req.user?.role || "").toLowerCase() === "admin";
const toHttpException = (error: unknown) => {
    const typed = error as { statusCode?: number; message?: string };
    return new HttpException({ msg: typed.statusCode ? typed.message : "Unable to process support ticket" }, typed.statusCode || 500);
};

@Controller("support/tickets")
@UseGuards(AuthGuard, RolesGuard)
export class SupportController {
    constructor(private readonly service: SupportTicketService) {}

    @Post()
    @Roles("customer", "admin")
    async createTicket(
        @Req() req: AuthenticatedRequest,
        @Body(new ZodValidationPipe(supportTicketCreateSchema)) body: { subject: string; message: string; category?: string; orderId?: number },
    ) {
        try {
            const ticket = await this.service.createTicket(userIdFrom(req), body);
            return { ticket, msg: "Support ticket created successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Get()
    @Roles("customer", "admin")
    async getTickets(
        @Req() req: AuthenticatedRequest,
        @Query(new ZodValidationPipe(supportTicketQuerySchema)) query: { status?: string },
    ) {
        try {
            const tickets = await this.service.listTickets(userIdFrom(req), isAdmin(req), query.status);
            return { tickets, msg: "Support tickets retrieved successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Patch(":id")
    @Roles("admin")
    async updateTicket(
        @Param("id") id: string,
        @Body(new ZodValidationPipe(supportTicketUpdateSchema)) body: UpdateSupportTicketInput,
    ) {
        try {
            const ticket = await this.service.updateTicket(Number(id), body);
            return { ticket, msg: "Support ticket updated successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }
}
