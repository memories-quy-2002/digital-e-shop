export type ProductEditValidationField =
    | "name"
    | "sku"
    | "category"
    | "brand"
    | "price"
    | "salePrice"
    | "warrantyMonths";

export type ProductEditValidationErrors = Partial<Record<ProductEditValidationField, string>>;

export type ProductEditValidationInput = {
    name: string;
    sku: string;
    category: string;
    brand: string;
    price: string | number;
    salePrice: string | number;
    warrantyMonths: string | number;
};

const hasText = (value: string | number | undefined): boolean => String(value ?? "").trim().length > 0;

const isNonNegativeNumber = (value: string | number | undefined): boolean => {
    if (!hasText(value)) return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
};

export const validateProductEdit = (input: ProductEditValidationInput): ProductEditValidationErrors => {
    const errors: ProductEditValidationErrors = {};

    if (!hasText(input.name)) errors.name = "Product name is required.";
    if (!hasText(input.sku)) errors.sku = "SKU is required.";
    if (!hasText(input.category)) errors.category = "Category is required.";
    if (!hasText(input.brand)) errors.brand = "Brand is required.";
    if (!isNonNegativeNumber(input.price)) errors.price = "Price must be a valid non-negative number.";

    if (hasText(input.salePrice) && !isNonNegativeNumber(input.salePrice)) {
        errors.salePrice = "Sale price must be empty or a valid non-negative number.";
    }

    if (hasText(input.warrantyMonths)) {
        const warrantyMonths = Number(input.warrantyMonths);
        if (!Number.isInteger(warrantyMonths) || warrantyMonths < 0) {
            errors.warrantyMonths = "Warranty must be empty or a whole non-negative number of months.";
        }
    }

    return errors;
};
