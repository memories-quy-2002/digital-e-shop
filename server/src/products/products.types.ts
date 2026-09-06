import type { ProductCreateInput, ProductUpdateInput } from "./products.dto";
import type { AttributeFilter, ProductAttribute } from "./product-attributes.types";

export type ProductEditorRow = {
    id: number;
    name: string;
    description?: string | null;
    category: string;
    brand: string;
    sku: string;
    manufacturer_part_number?: string | null;
    warranty_months?: number | null;
    price: number;
    sale_price?: number | null;
    stock: number;
    available_stock?: number;
    specifications?: string | null;
    attributes?: ProductAttribute[] | Record<string, unknown> | string | null;
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

export type { AttributeFilter, ProductAttribute };

export type { ProductCreateInput, ProductUpdateInput };
