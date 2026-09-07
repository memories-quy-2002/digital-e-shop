export type AdminAlertType = "order" | "payment" | "inventory" | "support" | "customer";
export type AdminAlertPriority = "High" | "Medium" | "Low";

export type AdminAlert = {
    id: string;
    type: AdminAlertType;
    title: string;
    description: string;
    createdAt: string;
    priority: AdminAlertPriority;
    actionLabel: string;
    route: string;
    unread: boolean;
};
