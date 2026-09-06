import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { TransactionContext } from "../database/transaction";
import type {
    ProductAttribute,
    ProductAttributeInput,
    ProductAttributeMap,
    ProductAttributeRow,
} from "./product-attributes.types";

const query = <T = unknown>(sql: string, values?: unknown[]): Promise<T> =>
    new Promise((resolve, reject) => {
        pool.query(sql, values, (error: Error | null, rows: T) => {
            if (error) return reject(error);
            resolve(rows);
        });
    });

const mapRow = (row: ProductAttributeRow): ProductAttribute => {
    const base = {
        id: Number(row.id),
        productId: Number(row.product_id),
        key: row.attribute_key,
        label: row.label,
        ...(row.unit ? { unit: row.unit } : {}),
        filterable: Boolean(row.filterable),
    };

    if (row.value_type === "number") {
        return { ...base, type: "number", numberValue: Number(row.number_value) };
    }

    return { ...base, type: "text", textValue: row.text_value || "" };
};

@Injectable()
export class ProductAttributesRepository {
    async replaceForProduct(
        tx: TransactionContext,
        productId: number,
        attributes: ProductAttributeInput[],
    ): Promise<void> {
        await tx.query("DELETE FROM product_attributes WHERE product_id = ?", [productId]);
        if (attributes.length === 0) return;

        const values = attributes.map((attribute) => [
            productId,
            attribute.key,
            attribute.label,
            attribute.type,
            attribute.type === "text" ? attribute.textValue : null,
            attribute.type === "number" ? attribute.numberValue : null,
            attribute.unit || null,
            attribute.filterable === false ? 0 : 1,
        ]);

        await tx.query(
            `INSERT INTO product_attributes
                (product_id, attribute_key, label, value_type, text_value, number_value, unit, filterable)
             VALUES ?`,
            [values],
        );
    }

    async getForProduct(productId: number): Promise<ProductAttribute[]> {
        const rows = await query<ProductAttributeRow[]>(
            `SELECT id, product_id, attribute_key, label, value_type, text_value, number_value, unit, filterable
             FROM product_attributes
             WHERE product_id = ?
             ORDER BY id ASC`,
            [productId],
        );
        return rows.map(mapRow);
    }

    async getForProducts(tx: TransactionContext, productIds: number[]): Promise<ProductAttributeMap> {
        const result: ProductAttributeMap = new Map();
        if (productIds.length === 0) return result;

        const placeholders = productIds.map(() => "?").join(", ");
        const rows = await tx.query<ProductAttributeRow[]>(
            `SELECT id, product_id, attribute_key, label, value_type, text_value, number_value, unit, filterable
             FROM product_attributes
             WHERE product_id IN (${placeholders})
             ORDER BY product_id ASC, id ASC`,
            productIds,
        );

        for (const row of rows) {
            const attributes = result.get(Number(row.product_id)) || [];
            attributes.push(mapRow(row));
            result.set(Number(row.product_id), attributes);
        }
        return result;
    }
}
