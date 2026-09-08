import { Injectable } from "@nestjs/common";
import { AdminAlertsRepository } from "./admin-alerts.repository";
import type { AdminAlert } from "./admin-alerts.types";

@Injectable()
export class AdminAlertsService {
    constructor(private readonly repository: AdminAlertsRepository) {}

    getAlerts(): Promise<AdminAlert[]> {
        return this.repository.getAlerts();
    }
}
