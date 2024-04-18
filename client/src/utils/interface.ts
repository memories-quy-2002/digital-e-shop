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

export interface Product {
	id: number;
	name: string;
	category: string;
	price: number;
	sale_price: number;
	rating: number;
	reviews: number;
	warranty: number;
	image: string;
	image_gallery: string[];
	stock: number;
	description: string;
	specifications: string[];
}
