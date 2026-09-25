import { Injectable, Optional } from "@nestjs/common";
import pool from "#src/config/database.config";
import util from "node:util";
import { randomUUID } from "node:crypto";
import { logger } from "#src/shared/utils/logger";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import type { ComparisonResponse, ProductComparisonRow, ProductEditorRow } from "./products.types";
import type { ProductCreateInput, ProductUpdateInput } from "./products.dto";
import type { ProductAttributeInput } from "./product-attributes.types";
import type { UploadedFile } from "../blob/blob.types";
import type { IdNameRow, InsertResult, UpdateResult } from "#src/shared/interfaces/domain";
import { NestProductsRepository } from "./products.repository";
import { NestInventoryService } from "../inventory/inventory.service";
import { ProductAttributesRepository } from "./product-attributes.repository";
import {
    assertComparisonCategory,
    ComparisonValidationError,
    normalizeComparisonAttributes,
} from "./products.compare";
import { withTransaction } from "../database/transaction";
import type { TransactionContext } from "../database/transaction";
import { ProductAlertsService } from "../product-alerts/product-alerts.service";
import { getProductAlertTransitions } from "../product-alerts/product-alerts.policy";

const query = util.promisify(pool.query).bind(pool);
const dbQuery = <T = unknown>(sql: string, values?: unknown[]): Promise<T> => query(sql, values) as Promise<T>;

const { put } = require("@vercel/blob");

function extractFileName(url: string) {
    const parts = url.split("/");
    return parts[parts.length - 1].split(".")[0];
}

const generateSku = () => `DIG-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

const normalizeNullableText = (value: unknown): string | null => {
    const normalized = String(value ?? "").trim();
    return normalized ? normalized : null;
};

const normalizeWarrantyMonths = (value: unknown): number | null => {
    if (value === undefined || value === null || value === "") return null;
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) {
        throw Object.assign(new Error("Warranty must be a non-negative whole number"), { statusCode: HTTP_STATUS.BAD_REQUEST });
    }
    return normalized;
};

@Injectable()
export class NestProductsService {
    constructor(
        private readonly productsRepository: NestProductsRepository,
        private readonly inventoryService: NestInventoryService,
        private readonly productAttributesRepository: ProductAttributesRepository,
        @Optional() private readonly productAlertsService?: ProductAlertsService,
    ) {}

    async getProductsForComparison(ids: number[]): Promise<ComparisonResponse> {
        const rows = await this.productsRepository.getProductsForComparison(ids);
        const foundIds = new Set(rows.map((row) => row.id));
        const missingIds = ids.filter((id) => !foundIds.has(id));

        if (missingIds.length > 0) {
            throw new ComparisonValidationError(
                "COMPARE_PRODUCTS_NOT_FOUND",
                "One or more products could not be found.",
                404,
                { missingIds },
            );
        }

        const ordered = ids.map((id) => rows.find((row) => row.id === id) as ProductComparisonRow);
        assertComparisonCategory(ordered);

        return {
            category: { name: ordered[0].category },
            products: ordered.map((product) => {
                const { categoryId, ...row } = product;
                void categoryId;

                return {
                    ...row,
                    attributes: normalizeComparisonAttributes(row.attributes),
                };
            }),
        };
    }

    async addSingleProductService(data: ProductCreateInput, file?: UploadedFile) {
        const {
            name,
            description,
            category,
            brand,
            specifications,
            sku,
            manufacturerPartNumber,
            warrantyMonths,
            attributes = [],
            price,
            inventory,
            imageUrl,
        } = data;
        const normalizedSku = String(sku ?? "").trim().toUpperCase() || generateSku();
        const normalizedManufacturerPartNumber = normalizeNullableText(manufacturerPartNumber);
        const normalizedWarrantyMonths = normalizeWarrantyMonths(warrantyMonths);

        const imageName = name.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
        logger.debug({ imageName }, "Preparing product image name");
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

        let fileName: string;
        if (imageUrl) {
            fileName = extractFileName(imageUrl);
        } else if (file) {
            const imageBuffer = file.buffer;
            const blob = await put(`uploads/${imageName}.jpg`, imageBuffer, { access: "public", token });
            fileName = extractFileName(blob.url);
        } else {
            throw new Error("Product image is required");
        }

        try {
            await withTransaction(async (tx) => {
                const brandId = await this.ensureNamedId("brands", brand, tx);
                const categoryId = await this.ensureNamedId("categories", category, tx);
                const result = await tx.query<InsertResult>(
                    `INSERT INTO products
                        (name, description, main_image, category_id, brand_id, specifications, sku, manufacturer_part_number, warranty_months, price, stock)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        name,
                        description,
                        fileName,
                        categoryId,
                        brandId,
                        specifications,
                        normalizedSku,
                        normalizedManufacturerPartNumber,
                        normalizedWarrantyMonths,
                        price,
                        inventory,
                    ],
                );
                await this.productAttributesRepository.replaceForProduct(tx, result.insertId, attributes as ProductAttributeInput[]);
                await this.inventoryService.createMovementsInTransaction(tx, [{
                    productId: result.insertId,
                    movementType: "initial_stock",
                    quantityChange: Number(inventory) || 0,
                    stockBefore: 0,
                    stockAfter: Number(inventory) || 0,
                    note: "Initial stock when product was created",
                    actorId: "admin",
                }]);
                return result;
            });
            return { msg: "Product added successfully" };
        } catch (err) {
            if ((err as { code?: string }).code === "ER_DUP_ENTRY") {
                throw Object.assign(new Error("SKU already exists"), { statusCode: HTTP_STATUS.CONFLICT });
            }
            throw err;
        }
    }

    private async ensureNamedId(tableName: "categories" | "brands", name: string, tx?: TransactionContext) {
        const safeName = String(name || "").trim();
        if (!safeName) {
            throw Object.assign(new Error(`${tableName} is required`), { statusCode: HTTP_STATUS.BAD_REQUEST });
        }

        const rows = tx
            ? await tx.query<IdNameRow[]>(`SELECT id FROM ${tableName} WHERE name = ?`, [safeName])
            : await dbQuery<IdNameRow[]>(`SELECT id FROM ${tableName} WHERE name = ?`, [safeName]);
        if (rows.length > 0) {
            return rows[0].id;
        }

        const result = tx
            ? await tx.query<InsertResult>(`INSERT INTO ${tableName} (name) VALUES (?)`, [safeName])
            : await dbQuery<InsertResult>(`INSERT INTO ${tableName} (name) VALUES (?)`, [safeName]);
        return result.insertId;
    }

    async updateProductDetailsService(pid: number, updates: ProductUpdateInput): Promise<ProductEditorRow> {
        const current = await this.productsRepository.getProductById(pid);
        if (!current) {
            throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
        }

        const name = String(updates.name ?? current.name).trim();
        const description = String(updates.description ?? current.description ?? "").trim();
        const category = String(updates.category ?? current.category).trim();
        const brand = String(updates.brand ?? current.brand).trim();
        const specifications = String(updates.specifications ?? current.specifications ?? "").trim();
        const sku = String(updates.sku ?? current.sku ?? "").trim().toUpperCase();
        const manufacturerPartNumber = updates.manufacturerPartNumber === undefined
            ? normalizeNullableText(current.manufacturer_part_number)
            : normalizeNullableText(updates.manufacturerPartNumber);
        const warrantyMonths = updates.warrantyMonths === undefined
            ? normalizeWarrantyMonths(current.warranty_months)
            : normalizeWarrantyMonths(updates.warrantyMonths);
        const price = Number(updates.price ?? current.price);
        const salePrice =
            updates.salePrice === undefined
                ? current.sale_price
                : updates.salePrice === "" || updates.salePrice === null
                  ? null
                  : Number(updates.salePrice);
        const stock = Number(updates.stock ?? current.stock);

        if (!name || !category || !brand || !sku || Number.isNaN(price) || Number.isNaN(stock) || price < 0 || stock < 0) {
            throw Object.assign(new Error("Name, category, brand, SKU, price, and quantity must be valid"), { statusCode: HTTP_STATUS.BAD_REQUEST });
        }

        if (salePrice !== null && (Number.isNaN(salePrice) || salePrice < 0)) {
            throw Object.assign(new Error("Sale price cannot be negative"), { statusCode: HTTP_STATUS.BAD_REQUEST });
        }

        try {
            const result = await withTransaction(async (tx) => {
                const lockedRows = await tx.query<Array<{ price: number; sale_price: number | null; stock: number }>>(
                    "SELECT price, sale_price, stock FROM products WHERE id = ? AND stock >= 0 FOR UPDATE",
                    [pid],
                );
                const locked = lockedRows[0];
                if (!locked) {
                    throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
                }
                const lockedBefore = {
                    productId: pid,
                    price: Number(locked.price),
                    salePrice: locked.sale_price === null || locked.sale_price === undefined ? null : Number(locked.sale_price),
                    stock: Number(locked.stock),
                };
                const nextPrice = updates.price === undefined ? lockedBefore.price : Number(updates.price);
                const nextSalePrice = updates.salePrice === undefined
                    ? lockedBefore.salePrice
                    : updates.salePrice === "" || updates.salePrice === null
                      ? null
                      : Number(updates.salePrice);
                const nextStock = updates.stock === undefined ? lockedBefore.stock : Number(updates.stock);
                const categoryId = await this.ensureNamedId("categories", category, tx);
                const brandId = await this.ensureNamedId("brands", brand, tx);
                const updateResult = await tx.query<UpdateResult>(
                    `UPDATE products
                    SET name = ?, description = ?, category_id = ?, brand_id = ?, specifications = ?, sku = ?, manufacturer_part_number = ?, warranty_months = ?, price = ?, sale_price = ?, stock = ?
                    WHERE id = ? AND stock >= 0`,
                    [name, description, categoryId, brandId, specifications, sku, manufacturerPartNumber, warrantyMonths, nextPrice, nextSalePrice, nextStock, pid],
                );
                if (updateResult.affectedRows === 0) return updateResult;
                if (updates.attributes !== undefined) {
                    await this.productAttributesRepository.replaceForProduct(tx, pid, updates.attributes);
                }
                if (lockedBefore.stock !== nextStock) {
                    await this.inventoryService.createMovementsInTransaction(tx, [{
                        productId: pid,
                        movementType: "manual_adjustment",
                        quantityChange: nextStock - lockedBefore.stock,
                        stockBefore: lockedBefore.stock,
                        stockAfter: nextStock,
                        note: "Product stock changed in product editor",
                        actorId: updates.actorId || "admin",
                    }]);
                }
                if (this.productAlertsService) {
                    const transitions = getProductAlertTransitions(lockedBefore, {
                        productId: pid,
                        price: nextPrice,
                        salePrice: nextSalePrice,
                        stock: nextStock,
                    });
                    if (transitions.length > 0) {
                        await this.productAlertsService.recordTransitionsInTransaction(tx, transitions);
                    }
                }
                return updateResult;
            });

            if (result.affectedRows === 0) {
                throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
            }

            const refreshed = await this.productsRepository.getProductById(pid);
            if (!refreshed) {
                throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
            }

            return refreshed;
        } catch (error) {
            if ((error as { code?: string }).code === "ER_DUP_ENTRY") {
                throw Object.assign(new Error("SKU already exists"), { statusCode: HTTP_STATUS.CONFLICT });
            }
            throw error;
        }
    }

    async updateInventoryService(pid: number, stock: number): Promise<ProductEditorRow> {
        await withTransaction(async (tx) => {
            const rows = await tx.query<Array<{ price: number; sale_price: number | null; stock: number }>>(
                "SELECT price, sale_price, stock FROM products WHERE id = ? AND stock >= 0 FOR UPDATE",
                [pid],
            );
            const before = rows[0];
            if (!before) {
                throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
            }
            const stockBefore = Number(before.stock) || 0;
            const beforeSnapshot = {
                productId: pid,
                price: Number(before.price),
                salePrice: before.sale_price === null || before.sale_price === undefined ? null : Number(before.sale_price),
                stock: stockBefore,
            };
            const result = await tx.query<UpdateResult>(
                "UPDATE products SET stock = ? WHERE id = ? AND stock >= 0",
                [stock, pid],
            );
            if (result.affectedRows === 0) {
                throw Object.assign(new Error("Product not found"), { statusCode: HTTP_STATUS.NOT_FOUND });
            }
            if (stockBefore !== stock) {
                await this.inventoryService.createMovementsInTransaction(tx, [{
                    productId: pid,
                    movementType: "manual_adjustment",
                    quantityChange: stock - stockBefore,
                    stockBefore,
                    stockAfter: stock,
                    note: "Inventory updated from admin quick restock",
                    actorId: "admin",
                }]);
            }
            if (this.productAlertsService && stockBefore !== stock) {
                const transitions = getProductAlertTransitions(beforeSnapshot, {
                    productId: pid,
                    price: beforeSnapshot.price,
                    salePrice: beforeSnapshot.salePrice,
                    stock,
                });
                if (transitions.length > 0) {
                    await this.productAlertsService.recordTransitionsInTransaction(tx, transitions);
                }
            }
        });

        const updated = await this.productsRepository.getProductById(pid);
        return updated as ProductEditorRow;
    }
}
