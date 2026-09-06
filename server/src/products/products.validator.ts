import { z } from "zod";
import { normalizeAttributeKey } from "./product-attributes.types";

const requiredText = (field: string) => z.string({ error: `${field} is required` }).trim().min(1, `${field} is required`);
const nonNegativeNumber = (field: string) => z.coerce.number({ error: `${field} must be a number` }).nonnegative(`${field} cannot be negative`);

const attributeKeySchema = z.string({ error: "Attribute key is required" })
    .trim()
    .min(1, "Attribute key is required")
    .transform(normalizeAttributeKey)
    .pipe(z.string().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/, "Attribute key must use lowercase snake_case").max(80, "Attribute key cannot exceed 80 characters"));
const attributeLabelSchema = requiredText("Attribute label").max(120, "Attribute label cannot exceed 120 characters");
const attributeUnitSchema = z.string().trim().max(32, "Attribute unit cannot exceed 32 characters").optional();

export const productAttributeInputSchema = z.discriminatedUnion("type", [
    z.object({
        key: attributeKeySchema,
        label: attributeLabelSchema,
        type: z.literal("text"),
        textValue: requiredText("Attribute value").max(255, "Attribute value cannot exceed 255 characters"),
        unit: attributeUnitSchema,
        filterable: z.boolean().optional().default(true),
    }),
    z.object({
        key: attributeKeySchema,
        label: attributeLabelSchema,
        type: z.literal("number"),
        numberValue: z.coerce.number({ error: "Attribute number must be a number" }).finite("Attribute number must be finite"),
        unit: attributeUnitSchema,
        filterable: z.boolean().optional().default(true),
    }),
]);

export const productAttributesSchema = z.array(productAttributeInputSchema).superRefine((attributes, context) => {
    const seen = new Set<string>();
    for (const [index, attribute] of attributes.entries()) {
        if (seen.has(attribute.key)) {
            context.addIssue({
                code: "custom",
                path: [index, "key"],
                message: `Duplicate attribute key: ${attribute.key}`,
            });
        }
        seen.add(attribute.key);
    }
});

export const attributeFilterSchema = z.union([
    z.object({
        key: attributeKeySchema,
        textValues: z.array(z.string().trim().min(1)).min(1).max(50),
    }),
    z.object({
        key: attributeKeySchema,
        min: z.coerce.number().finite(),
        max: z.coerce.number().finite().optional(),
    }).superRefine((filter, context) => {
        if (filter.max !== undefined && filter.max < filter.min) {
            context.addIssue({ code: "custom", path: ["max"], message: "Attribute filter max must be greater than or equal to min" });
        }
    }),
]);

const parseMultipartJson = (value: unknown) => {
    if (typeof value !== "string") return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
};

const attributesInputSchema = z.preprocess(parseMultipartJson, productAttributesSchema).optional().default([]);

export const productCreateSchema = z.object({
    name: requiredText("Product name"),
    description: z.string().trim().optional().default(""),
    category: requiredText("Category"),
    brand: requiredText("Brand"),
    specifications: z.string().trim().optional().default(""),
    sku: z.string().trim().max(64, "SKU cannot exceed 64 characters").optional(),
    manufacturerPartNumber: z.string().trim().max(128, "Manufacturer part number cannot exceed 128 characters").optional(),
    warrantyMonths: z.coerce.number({ error: "Warranty must be a number" }).int("Warranty must be a whole number").nonnegative("Warranty cannot be negative").nullable().optional(),
    attributes: attributesInputSchema,
    price: nonNegativeNumber("Price"),
    inventory: z.coerce.number({ error: "Inventory must be a number" }).int("Inventory must be a whole number").nonnegative("Inventory cannot be negative"),
    imageUrl: z.string().trim().optional(),
});

export const productUpdateSchema = z.object({
    name: requiredText("Product name").optional(),
    description: z.string().trim().optional(),
    category: requiredText("Category").optional(),
    brand: requiredText("Brand").optional(),
    specifications: z.string().trim().optional(),
    sku: requiredText("SKU").max(64, "SKU cannot exceed 64 characters"),
    manufacturerPartNumber: z.string().trim().max(128, "Manufacturer part number cannot exceed 128 characters").nullable().optional(),
    warrantyMonths: z.coerce.number({ error: "Warranty must be a number" }).int("Warranty must be a whole number").nonnegative("Warranty cannot be negative").nullable().optional(),
    attributes: z.preprocess(parseMultipartJson, productAttributesSchema).optional(),
    price: nonNegativeNumber("Price").optional(),
    salePrice: z.union([nonNegativeNumber("Sale price"), z.literal(""), z.null(), z.undefined()]).optional(),
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative").optional(),
});

export const inventoryUpdateSchema = z.object({
    stock: z.coerce.number({ error: "Stock must be a number" }).int("Stock must be a whole number").nonnegative("Stock cannot be negative"),
});
