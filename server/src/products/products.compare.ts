import type { ProductComparisonAttribute, ProductComparisonRow } from "./products.types";
import { normalizeAttributeKey } from "./product-attributes.types";

const MIN_COMPARISON_PRODUCTS = 2;
const MAX_COMPARISON_PRODUCTS = 4;

export type ComparisonErrorCode =
    | "COMPARE_INVALID_IDS"
    | "COMPARE_PRODUCTS_NOT_FOUND"
    | "COMPARE_CATEGORY_MISMATCH";

export class ComparisonValidationError extends Error {
    constructor(
        public readonly code: ComparisonErrorCode,
        message: string,
        public readonly statusCode: 400 | 404 | 422,
        public readonly details: Record<string, unknown> = {},
    ) {
        super(message);
        this.name = "ComparisonValidationError";
    }
}

export const parseComparisonIds = (value: unknown): number[] => {
    if (typeof value !== "string") {
        throw new ComparisonValidationError(
            "COMPARE_INVALID_IDS",
            "Two to four valid products are required.",
            400,
        );
    }

    const ids = value.split(",").map((item) => Number(item.trim()));
    const unique = new Set(ids);
    const valid = ids.every((id) => Number.isInteger(id) && id > 0);

    if (
        !valid ||
        ids.length < MIN_COMPARISON_PRODUCTS ||
        ids.length > MAX_COMPARISON_PRODUCTS ||
        unique.size !== ids.length
    ) {
        throw new ComparisonValidationError(
            "COMPARE_INVALID_IDS",
            "Two to four valid products are required.",
            400,
        );
    }

    return ids;
};

export const assertComparisonCategory = (
    products: Array<Pick<ProductComparisonRow, "id" | "categoryId" | "category">>,
) => {
    if (new Set(products.map((product) => product.categoryId)).size > 1) {
        throw new ComparisonValidationError(
            "COMPARE_CATEGORY_MISMATCH",
            "Products must belong to the same category.",
            422,
            {
                categories: products.map(({ id, category }) => ({ id, name: category })),
            },
        );
    }
};

type RawComparisonAttribute = Record<string, unknown>;

const readAttributeValue = (source: RawComparisonAttribute, type: "text" | "number"): string => {
    const value =
        type === "number"
            ? source.numberValue ?? source.number_value ?? source.value
            : source.textValue ?? source.text_value ?? source.value;

    return value === null || value === undefined ? "" : String(value);
};

export const normalizeComparisonAttributes = (value: unknown): ProductComparisonAttribute[] => {
    const entries =
        Array.isArray(value)
            ? value.map((item, index) => [String(index), item] as const)
            : value && typeof value === "object"
              ? Object.entries(value as Record<string, unknown>)
              : [];

    return entries
        .map(([entryKey, item]) => {
            const source = item && typeof item === "object" ? (item as RawComparisonAttribute) : {};
            const rawType = source.type ?? source.value_type;
            const type: "text" | "number" =
                rawType === "number" ||
                (rawType !== "text" &&
                    (source.numberValue !== undefined ||
                        source.number_value !== undefined))
                    ? "number"
                    : "text";
            const key = normalizeAttributeKey(
                String(source.key ?? source.attribute_key ?? entryKey),
            );

            if (!key) {
                return null;
            }

            return {
                key,
                label: String(source.label ?? key),
                type,
                value: readAttributeValue(source, type),
                unit: String(source.unit ?? ""),
            };
        })
        .filter((attribute): attribute is ProductComparisonAttribute => attribute !== null);
};
