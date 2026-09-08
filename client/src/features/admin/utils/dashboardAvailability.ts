export type DashboardSectionKey = "analytics" | "products" | "orders" | "users" | "orderItems";
export type DashboardSectionStatus = "loading" | "success" | "error";
export type DashboardAvailability = Record<DashboardSectionKey, DashboardSectionStatus>;

export const initialDashboardAvailability: DashboardAvailability = {
    analytics: "loading",
    products: "loading",
    orders: "loading",
    users: "loading",
    orderItems: "loading",
};

export function displayDashboardValue<T>(status: DashboardSectionStatus, value: T): T | "Unavailable" {
    return status === "error" ? "Unavailable" : value;
}

export function getDashboardUpdateLabel(availability: DashboardAvailability): "Updated" | "Partially updated" | "Unable to load" {
    const statuses = Object.values(availability);

    if (statuses.every((status) => status === "error")) {
        return "Unable to load";
    }

    if (statuses.some((status) => status === "error")) {
        return "Partially updated";
    }

    return "Updated";
}
