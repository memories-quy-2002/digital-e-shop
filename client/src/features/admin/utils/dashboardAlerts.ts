import type { AdminAlert } from "../api";

export type DashboardAlertGroup = {
    type: AdminAlert["type"];
    count: number;
    priority: AdminAlert["priority"];
    title: string;
    description: string;
    actionLabel: string;
    route: string;
};

const PRIORITY_WEIGHT: Record<AdminAlert["priority"], number> = {
    High: 3,
    Medium: 2,
    Low: 1,
};

const getCreatedAtTime = (createdAt: string) => {
    const timestamp = Date.parse(createdAt);
    return Number.isNaN(timestamp) ? 0 : timestamp;
};

export function groupAdminAlerts(alerts: AdminAlert[], limit = 4): DashboardAlertGroup[] {
    if (limit <= 0 || alerts.length === 0) {
        return [];
    }

    const sortedAlerts = [...alerts].sort((left, right) => {
        const priorityDifference = PRIORITY_WEIGHT[right.priority] - PRIORITY_WEIGHT[left.priority];
        if (priorityDifference !== 0) {
            return priorityDifference;
        }

        return getCreatedAtTime(right.createdAt) - getCreatedAtTime(left.createdAt);
    });

    const groups = new Map<AdminAlert["type"], DashboardAlertGroup>();
    sortedAlerts.forEach((alert) => {
        const existingGroup = groups.get(alert.type);
        if (existingGroup) {
            existingGroup.count += 1;
            return;
        }

        groups.set(alert.type, {
            type: alert.type,
            count: 1,
            priority: alert.priority,
            title: alert.title,
            description: alert.description,
            actionLabel: alert.actionLabel,
            route: alert.route,
        });
    });

    return Array.from(groups.values()).slice(0, limit);
}
