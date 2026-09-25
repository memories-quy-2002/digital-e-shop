export const USER_ROLE = {
    CUSTOMER: "Customer",
    ADMIN: "Admin",
} as const;

export const USER_ACCOUNT_STATUS = {
    ACTIVE: "Active",
    SUSPENDED: "Suspended",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUS)[keyof typeof USER_ACCOUNT_STATUS];
