import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard, Roles } from "../guards/roles.guard";
import { EmailService } from "./email.service";
import { adminEmailIdSchema, adminEmailListQuerySchema, adminEmailResendBodySchema } from "./email.validator";

@Controller("admin/email")
export class AdminEmailController {
    constructor(private readonly email: EmailService) {}

    @Get()
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async list(@Query() query: Record<string, unknown>) {
        const parsed = adminEmailListQuerySchema.safeParse(query);
        if (!parsed.success) throw new BadRequestException("Invalid email list query");
        const messages = await this.email.listAdminMessages(parsed.data.limit, parsed.data.afterId);
        return { messages, nextAfterId: messages.length === parsed.data.limit ? messages[messages.length - 1]?.id : null };
    }

    @Post(":id/resend")
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async resend(@Param("id") rawId: string, @Body() body: unknown, @Req() request: Request) {
        const id = adminEmailIdSchema.safeParse(rawId);
        const input = adminEmailResendBodySchema.safeParse(body ?? {});
        const adminId = String(request.user?.id || "");
        if (!id.success || !input.success || !adminId) throw new BadRequestException("Invalid resend request");
        return this.email.resend(Number(id.data), adminId, input.data.acknowledgeUnknownOutcome);
    }
}
