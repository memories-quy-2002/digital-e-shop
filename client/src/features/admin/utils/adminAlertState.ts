import type { AdminAlert } from "../api";

export const ADMIN_ALERT_READ_STATE_EVENT = "digital-e:admin-alert-read-state";

const STORAGE_PREFIX = "digital-e:admin-alert-read:";
const MAX_STORED_ALERTS = 500;

const getStorageKey = (userId?: string | null) => `${STORAGE_PREFIX}${userId || "shared"}`;

const notifyReadStateChanged = () => {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(ADMIN_ALERT_READ_STATE_EVENT));
    }
};

export const getAdminAlertReadIds = (userId?: string | null): string[] => {
    if (typeof window === "undefined") return [];

    try {
        const stored = JSON.parse(window.localStorage.getItem(getStorageKey(userId)) || "[]");
        return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
};

export const saveAdminAlertReadIds = (userId: string | null | undefined, ids: string[]) => {
    if (typeof window === "undefined") return;

    const uniqueIds = [...new Set(ids)].slice(-MAX_STORED_ALERTS);
    try {
        window.localStorage.setItem(getStorageKey(userId), JSON.stringify(uniqueIds));
        notifyReadStateChanged();
    } catch {
        // A private browsing context can reject storage access. The in-memory
        // state still keeps the current view accurate in that case.
    }
};

export const applyAdminAlertReadState = (alerts: AdminAlert[], readIds: string[]) => {
    const readIdSet = new Set(readIds);
    return alerts.map((alert) => ({
        ...alert,
        unread: Boolean(alert.unread) && !readIdSet.has(alert.id),
    }));
};
