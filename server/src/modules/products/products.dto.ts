export type ProductCreateInput = {
    name: string;
    description: string;
    category: string;
    brand: string;
    specifications?: string;
    price: number | string;
    inventory: number | string;
    imageUrl?: string;
};

export type ProductUpdateInput = Partial<{
    name: string;
    description: string;
    category: string;
    brand: string;
    specifications: string;
    price: number | string;
    salePrice: number | string | null;
    stock: number | string;
    actorId: string | number;
}>;
