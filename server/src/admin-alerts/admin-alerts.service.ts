import { Injectable, NotFoundException } from "@nestjs/common";
import { AdminAlertsRepository, type AdminAlertTriageState } from "./admin-alerts.repository";
import type { AdminAlert, AdminAlertTriageAction } from "./admin-alerts.types";

@Injectable()
export class AdminAlertsService {
    constructor(private readonly repository: AdminAlertsRepository) {}

    getAlerts(adminId: string): Promise<AdminAlert[]> {
        return this.repository.getAlerts(adminId);
    }

    async acknowledgeAlerts(adminId: string, alertIds: string[]): Promise<void> {
        const activeAlerts = await this.repository.getAlerts(adminId);
        const unreadActiveIds = new Set(activeAlerts.filter((alert) => alert.unread).map((alert) => alert.id));
        const allowedIds = alertIds.filter((alertId) => unreadActiveIds.has(alertId));
        await this.repository.acknowledgeAlerts(adminId, allowedIds);
    }

    async updateTriage(adminId: string, alertId: string, action: AdminAlertTriageAction): Promise<AdminAlertTriageState> {
        const alerts = await this.repository.getAlerts(adminId);
        if (!alerts.some((alert) => alert.id === alertId)) {
            throw new NotFoundException("This alert is no longer active.");
        }
        return this.repository.updateTriage(alertId, adminId, action);
    }
}
