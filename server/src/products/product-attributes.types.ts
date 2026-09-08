export type ProductAttributeType = "text" | "number";

export type ProductAttributeInput =
    | {
          key: string;
          label: string;
          type: "text";
          textValue: string;
          unit?: string;
          filterable?: boolean;
      }
    | {
          key: string;
          label: string;
          type: "number";
          numberValue: number;
          unit?: string;
          filterable?: boolean;
      };

export type ProductAttribute = ProductAttributeInput & {
    id?: number;
    productId?: number;
};

export type ProductAttributeRow = {
    id: number;
    product_id: number;
    attribute_key: string;
    label: string;
    value_type: ProductAttributeType;
    text_value: string | null;
    number_value: number | string | null;
    unit: string | null;
    filterable: number | boolean;
};

export type AttributeFilter =
    | { key: string; textValues: string[] }
    | { key: string; min: number; max?: number };

export type ProductAttributeMap = Map<number, ProductAttribute[]>;

export const normalizeAttributeKey = (value: string): string =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_+/g, "_");

export const attributeMapToSnapshot = (attributes: ProductAttribute[] | undefined): Record<string, unknown> =>
    (attributes || []).reduce<Record<string, unknown>>((snapshot, attribute) => {
        snapshot[attribute.key] = {
            label: attribute.label,
            type: attribute.type,
            value: attribute.type === "number" ? attribute.numberValue : attribute.textValue,
            ...(attribute.unit ? { unit: attribute.unit } : {}),
            filterable: attribute.filterable !== false,
        };
        return snapshot;
    }, {});
