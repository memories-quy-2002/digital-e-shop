import { Controller, Get, HttpException, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AdminAuditService } from "./admin-audit.service";
import { adminAuditQuerySchema } from "./admin-audit.validator";

@Controller("admin/audit")
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminAuditController {
    constructor(private readonly service: AdminAuditService) {}

    @Get()
    async getAuditEvents(@Query(new ZodValidationPipe(adminAuditQuerySchema)) query: {
        page: number;
        limit: number;
        search: string;
        entityType?: "product" | "user" | "promotion";
    }) {
        try {
            return { ...await this.service.getEvents(query.page, query.limit, query), msg: "Admin audit events retrieved successfully" };
        } catch (error) {
            if (error instanceof HttpException) throw error;
            throw new HttpException({ msg: "Unable to load admin audit events" }, HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
