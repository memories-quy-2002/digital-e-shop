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
