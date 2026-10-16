export enum Role {
    Customer = "Customer",
    Admin = "Admin",
    DeliveryStaff = "DeliveryStaff",
}

export interface User {
    UID: number;
    UName: string;
    UEmail: string;
    UPassword: string;
    URole: Role;
    ULast_login: string;
}

export type UserData = {
    id: string;
    email: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role.Admin | Role.Customer | Role.DeliveryStaff;
    status?: "Active" | "Suspended";
    email_verified?: boolean;
    created_at: Date;
    last_login: Date;
} | null;
