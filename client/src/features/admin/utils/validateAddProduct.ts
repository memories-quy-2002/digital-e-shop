export type AddProductField = "name" | "category" | "brand" | "price" | "inventory";

export type AddProductValidationInput = {
    name: string;
    category: string;
    brand: string;
    price: number | string;
    inventory: number | string;
};

export type AddProductValidationErrors = Partial<Record<AddProductField, string>>;

const isBlank = (value: string) => value.trim().length === 0;

const hasNoValue = (value: number | string) => typeof value === "string" && value.trim().length === 0;

const validateNonNegativeNumber = (value: number | string, label: string) => {
    if (hasNoValue(value)) return `${label} is required.`;

    const numericValue = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
        return `${label} must be a non-negative number.`;
    }

    return undefined;
};

export const validateAddProduct = (input: AddProductValidationInput): AddProductValidationErrors => {
    const errors: AddProductValidationErrors = {};

    if (isBlank(input.name)) errors.name = "Product name is required.";
    if (isBlank(input.category)) errors.category = "Category is required.";
    if (isBlank(input.brand)) errors.brand = "Brand is required.";

    const priceError = validateNonNegativeNumber(input.price, "Price");
    if (priceError) errors.price = priceError;

    const inventoryError = validateNonNegativeNumber(input.inventory, "Inventory quantity");
    if (inventoryError) {
        errors.inventory = inventoryError;
    } else {
        const inventoryValue = typeof input.inventory === "number" ? input.inventory : Number(input.inventory);
        if (!Number.isInteger(inventoryValue)) {
            errors.inventory = "Inventory quantity must be a whole number.";
        }
    }

    return errors;
};

