import type { ProductCreateInput, ProductUpdateInput } from "./products.dto";

export type ProductEditorRow = {
    id: number;
    name: string;
    description?: string | null;
    category: string;
    brand: string;
    price: number;
    sale_price?: number | null;
    stock: number;
    specifications?: string | null;
    main_image?: string;
    rating?: number;
    reviews?: number;
};

export type ProductFacetValueRow = {
    name: string;
};

export type ProductPriceBoundsRow = {
    min_price: number | null;
    max_price: number | null;
};

export type { ProductCreateInput, ProductUpdateInput };
