import { Module } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { AdminAuditController } from "./admin-audit.controller";
import { AdminAuditRepository } from "./admin-audit.repository";
import { AdminAuditService } from "./admin-audit.service";

@Module({
    controllers: [AdminAuditController],
    providers: [AuthGuard, RolesGuard, AdminAuditRepository, AdminAuditService],
})
export class AdminAuditModule {}
