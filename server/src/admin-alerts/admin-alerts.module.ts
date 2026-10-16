import { Module } from "@nestjs/common";
import { AdminAlertsController } from "./admin-alerts.controller";
import { AdminAlertsRepository } from "./admin-alerts.repository";
import { AdminAlertsService } from "./admin-alerts.service";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    controllers: [AdminAlertsController],
    providers: [AuthGuard, RolesGuard, AdminAlertsRepository, AdminAlertsService],
})
export class AdminAlertsModule {}
