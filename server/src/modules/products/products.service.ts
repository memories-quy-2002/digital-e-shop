const { put } = require("@vercel/blob");
const util = require("util");
import pool from "#src/config/database.config";
const inventoryMovementService = require("#src/modules/inventory/inventory.service");
const query = util.promisify(pool.query).bind(pool);
import type {
    IdNameRow,
    InsertResult,
    UpdateResult,
} from "#src/shared/interfaces/domain";
import type { ProductCreateInput, ProductUpdateInput } from "./products.dto";
import type { ProductEditorRow } from "./products.types";
import type { UploadedFile } from "#src/modules/blob/blob.types";

const dbQuery = <T = unknown>(sql: string, values?: unknown[]): Promise<T> => query(sql, values) as Promise<T>;

function extractFileName(url: string) {
    const parts = url.split("/");
    return parts[parts.length - 1].split(".")[0];
}

async function addSingleProductService(data: ProductCreateInput, file?: UploadedFile) {
    const { name, description, category, brand, specifications, price, inventory, imageUrl } = data;

    // Upload image to Vercel Blob
    const imageName = name.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
    console.log(imageName)
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

    let fileName;
    if (imageUrl) {
        fileName = extractFileName(imageUrl);
    } else if (file) {
        const imageBuffer = file.buffer;
        const blob = await put(`uploads/${imageName}.jpg`, imageBuffer, { access: "public", token });
        fileName = extractFileName(blob.url);
    } else {
        throw new Error("Product image is required");
    }

    // Transaction
    await query("START TRANSACTION");

    try {
        // Ensure brand
        let brandId;
        const brandResults = await dbQuery<IdNameRow[]>("SELECT id FROM brands WHERE name = ?", [brand]);
        if (brandResults.length > 0) {
            brandId = brandResults[0].id;
        } else {
            const insertBrand = await dbQuery<InsertResult>("INSERT INTO brands (name) VALUES (?)", [brand]);
            brandId = insertBrand.insertId;
        }

        // Ensure category
        let categoryId;
        const categoryResults = await dbQuery<IdNameRow[]>("SELECT id FROM categories WHERE name = ?", [category]);
        if (categoryResults.length > 0) {
            categoryId = categoryResults[0].id;
        } else {
            const insertCategory = await dbQuery<InsertResult>("INSERT INTO categories (name) VALUES (?)", [category]);
            categoryId = insertCategory.insertId;
        }

        // Insert product
        const insertProduct = await dbQuery<InsertResult>(
            `INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description, fileName, categoryId, brandId, specifications, price, inventory]
        );

        await query("COMMIT");
        inventoryMovementService.recordMovement({
            productId: insertProduct.insertId,
            movementType: "initial_stock",
            quantityChange: Number(inventory) || 0,
            stockBefore: 0,
            stockAfter: Number(inventory) || 0,
            note: "Initial stock when product was created",
            actorId: "admin",
        });
        return { msg: "Product added successfully" };
    } catch (err) {
        await query("ROLLBACK");
        throw err;
    }
}

async function ensureNamedId(tableName: "categories" | "brands", name: string) {
    const safeName = String(name || "").trim();
    if (!safeName) {
        throw Object.assign(new Error(`${tableName} is required`), { statusCode: 400 });
    }

    const rows = await dbQuery<IdNameRow[]>(`SELECT id FROM ${tableName} WHERE name = ?`, [safeName]);
    if (rows.length > 0) {
        return rows[0].id;
    }

    const result = await dbQuery<InsertResult>(`INSERT INTO ${tableName} (name) VALUES (?)`, [safeName]);
    return result.insertId;
}

async function updateProductDetailsService(pid: number, updates: ProductUpdateInput) {
    const currentRows = await dbQuery<ProductEditorRow[]>(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, specifications
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        WHERE products.id = ? AND products.stock >= 0`,
        [pid]
    );

    if (currentRows.length === 0) {
        throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    }

    const current = currentRows[0];
    const name = String(updates.name ?? current.name).trim();
    const description = String(updates.description ?? current.description ?? "").trim();
    const category = String(updates.category ?? current.category).trim();
    const brand = String(updates.brand ?? current.brand).trim();
    const specifications = String(updates.specifications ?? current.specifications ?? "").trim();
    const price = Number(updates.price ?? current.price);
    const salePrice =
        updates.salePrice === undefined
            ? current.sale_price
            : updates.salePrice === "" || updates.salePrice === null
              ? null
              : Number(updates.salePrice);
    const stock = Number(updates.stock ?? current.stock);

    if (!name || !category || !brand || Number.isNaN(price) || Number.isNaN(stock) || price < 0 || stock < 0) {
        throw Object.assign(new Error("Name, category, brand, price, and quantity must be valid"), { statusCode: 400 });
    }

    if (salePrice !== null && (Number.isNaN(salePrice) || salePrice < 0)) {
        throw Object.assign(new Error("Sale price cannot be negative"), { statusCode: 400 });
    }

    const categoryId = await ensureNamedId("categories", category);
    const brandId = await ensureNamedId("brands", brand);

    const result = await dbQuery<UpdateResult>(
        `UPDATE products
        SET name = ?, description = ?, category_id = ?, brand_id = ?, specifications = ?, price = ?, sale_price = ?, stock = ?
        WHERE id = ? AND stock >= 0`,
        [name, description, categoryId, brandId, specifications, price, salePrice, stock, pid]
    );

    if (result.affectedRows === 0) {
        throw Object.assign(new Error("Product not found"), { statusCode: 404 });
    }

    const refreshedRows = await dbQuery<ProductEditorRow[]>(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            specifications,
            COALESCE(review_summary.rating, 0) AS rating,
            COALESCE(review_summary.reviews, 0) AS reviews
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        LEFT JOIN (
            SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
            FROM reviews
            GROUP BY product_id
        ) review_summary ON review_summary.product_id = products.id
        WHERE products.id = ? AND products.stock >= 0`,
        [pid]
    );

    const refreshed = refreshedRows[0];
    const previousStock = Number(current.stock) || 0;
    const nextStock = Number(refreshed.stock) || 0;
    if (previousStock !== nextStock) {
        inventoryMovementService.recordMovement({
            productId: pid,
            movementType: "manual_adjustment",
            quantityChange: nextStock - previousStock,
            stockBefore: previousStock,
            stockAfter: nextStock,
            note: "Product stock changed in product editor",
            actorId: updates.actorId || "admin",
        });
    }

    return refreshed;
}

module.exports = { addSingleProductService, updateProductDetailsService };

