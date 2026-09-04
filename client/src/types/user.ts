export enum Role {
    Customer = "Customer",
    Admin = "Admin",
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
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role.Admin | Role.Customer;
    token: string;
    created_at: Date;
    last_login: Date;
} | null;
