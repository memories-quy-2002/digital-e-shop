import { normalizeAttributeKey } from "../api";
import { parseProductDetails } from "../../../utils/productDetails";
import type { ProductWithAttributes } from "../api";
import type { ComparisonMatrixRow } from "./types";

export const COMPARISON_MISSING_VALUE = String.fromCharCode(0x2014);

type MatrixValue = {
    label: string;
    unit: string;
    value: string;
};

const formattedValue = (value: string, unit = "") => {
    const normalizedValue = value.trim();
    const normalizedUnit = unit.trim();
    return normalizedUnit ? `${normalizedValue} ${normalizedUnit}`.trim() : normalizedValue;
};

const normalizedComparisonValue = (value: string) => value.trim().toLocaleLowerCase();

const attributeValuesForProduct = (product: ProductWithAttributes): MatrixValue[] => {
    if (product.attributes.length > 0) {
        return product.attributes.map((attribute) => ({
            label: attribute.label.trim(),
            unit: attribute.unit.trim(),
            value: attribute.value.trim(),
        }));
    }

    return parseProductDetails(product.specifications).specifications.map((specification) => ({
        label: specification.label.trim(),
        unit: "",
        value: specification.value.trim(),
    }));
};

export const buildComparisonRows = (products: ProductWithAttributes[]): ComparisonMatrixRow[] => {
    const rows = new Map<string, { label: string; unit: string; values: Record<string, string> }>();

    for (const product of products) {
        const valuesForProduct = new Map<string, MatrixValue>();
        for (const attribute of attributeValuesForProduct(product)) {
            const key = normalizeAttributeKey(attribute.label);
            if (!key || valuesForProduct.has(key)) {
                continue;
            }

            valuesForProduct.set(key, attribute);
            const row = rows.get(key) ?? {
                label: attribute.label || key,
                unit: attribute.unit,
                values: {},
            };
            row.values[String(product.id)] = formattedValue(attribute.value, attribute.unit);
            rows.set(key, row);
        }
    }

    return Array.from(rows.entries()).map(([key, row]) => {
        const values = products.reduce<Record<string, string>>((result, product) => {
            result[String(product.id)] = row.values[String(product.id)] ?? COMPARISON_MISSING_VALUE;
            return result;
        }, {});
        const comparableValues = Object.values(values).map(normalizedComparisonValue);

        return {
            key,
            label: row.label,
            ...(row.unit ? { unit: row.unit } : {}),
            values,
            isDifferent: new Set(comparableValues).size > 1,
        };
    });
};

export const filterComparisonRows = (rows: ComparisonMatrixRow[], differencesOnly: boolean): ComparisonMatrixRow[] =>
    differencesOnly ? rows.filter((row) => row.isDifferent) : rows;
