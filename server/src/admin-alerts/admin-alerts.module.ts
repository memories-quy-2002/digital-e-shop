import { Module } from "@nestjs/common";
import { AdminAlertsController } from "./admin-alerts.controller";
import { AdminAlertsRepository } from "./admin-alerts.repository";
import { AdminAlertsService } from "./admin-alerts.service";

@Module({
    controllers: [AdminAlertsController],
    providers: [AdminAlertsRepository, AdminAlertsService],
})
export class AdminAlertsModule {}
