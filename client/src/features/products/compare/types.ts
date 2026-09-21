import type { ProductWithAttributes } from "../api";

export type ProductComparison = {
    category: { name: string };
    products: ProductWithAttributes[];
};

export type ComparisonMatrixRow = {
    key: string;
    label: string;
    unit?: string;
    values: Record<string, string>;
    isDifferent: boolean;
};
