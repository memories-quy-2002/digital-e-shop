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
	brand: string;
	price: number;
	sale_price: number | null;
	rating: number;
	reviews: number;
	main_image: string | null;
	image_gallery: string[] | null;
	stock: number;
	description: string;
	specifications: string[] | null;
}
