const pool = require("../config/db");
import type { CountRow, IdNameRow, ProductEditorRow, QueryCallback, UpdateResult } from "../types/domain";

type ProductInsertRecord = {
    name: string;
    description: string;
    fileName: string;
    categoryId: number;
    brandId: number;
    specifications?: string;
    price: number;
    inventory: number;
};

type ProductUpdateRecord = {
    name: string;
    description: string;
    categoryId: number;
    brandId: number;
    specifications?: string;
    price: number;
    salePrice?: number | null;
    stock: number;
};

type RelevantProductRow = {
    product_id: number;
    product_name: string;
};

const productRatingJoin = `
    LEFT JOIN (
        SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
        FROM reviews
        GROUP BY product_id
    ) review_summary ON review_summary.product_id = products.id
`;

const productRatingSelect = `
    COALESCE(review_summary.rating, 0) AS rating,
    COALESCE(review_summary.reviews, 0) AS reviews
`;

// Insert product
const insertProduct = (product: ProductInsertRecord, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            product.name,
            product.description,
            product.fileName,
            product.categoryId,
            product.brandId,
            product.specifications,
            product.price,
            product.inventory,
        ],
        callback
    );
};

// Find category by name
const findCategoryByName = (category: string, callback: QueryCallback<IdNameRow[]>) => {
    pool.query("SELECT id FROM categories WHERE name = ?", [category], callback);
};

// Insert new category
const insertCategory = (category: string, callback: QueryCallback<UpdateResult>) => {
    pool.query("INSERT INTO categories (name) VALUES (?)", [category], callback);
};

// Find brand by name
const findBrandByName = (brand: string, callback: QueryCallback<IdNameRow[]>) => {
    pool.query("SELECT id FROM brands WHERE name = ?", [brand], callback);
};

// Insert new brand
const insertBrand = (brand: string, callback: QueryCallback<UpdateResult>) => {
    pool.query("INSERT INTO brands (name) VALUES (?)", [brand], callback);
};

// Get product by id
const getProductById = (pid: number, callback: QueryCallback<ProductEditorRow[]>) => {
    pool.query(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            specifications, ${productRatingSelect}
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        ${productRatingJoin}
        WHERE products.id = ? AND products.stock >= 0`,
        [pid],
        callback
    );
};

// Get all products
const getAllProducts = (callback: QueryCallback<ProductEditorRow[]>) => {
    pool.query(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            specifications, ${productRatingSelect}
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        ${productRatingJoin}
        WHERE products.stock >= 0`,
        callback
    );
};

const getAllProductsPaginated = (limit: number, offset: number, callback: QueryCallback<ProductEditorRow[]>) => {
    pool.query(
        `SELECT products.id, products.name, description, categories.name AS category,
            brands.name AS brand, price, sale_price, stock, main_image,
            specifications, ${productRatingSelect}
        FROM products
        JOIN categories ON categories.id = products.category_id
        JOIN brands ON brands.id = products.brand_id
        ${productRatingJoin}
        WHERE products.stock >= 0
        ORDER BY products.id DESC
        LIMIT ? OFFSET ?`,
        [limit, offset],
        callback
    );
};

const getProductsCount = (callback: QueryCallback<CountRow[]>) => {
    pool.query("SELECT COUNT(*) AS total FROM products WHERE stock >= 0", callback);
};

const getInventorySummary = (callback: QueryCallback) => {
    pool.query(
        `SELECT
            COUNT(*) AS total_products,
            SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
            SUM(CASE WHEN stock > 0 AND stock <= 5 THEN 1 ELSE 0 END) AS low_stock,
            SUM(CASE WHEN stock > 5 THEN 1 ELSE 0 END) AS healthy_stock,
            SUM(stock) AS total_units
        FROM products
        WHERE stock >= 0`,
        callback
    );
};

const updateProductStock = (pid: number, stock: number, callback: QueryCallback<UpdateResult>) => {
    pool.query("UPDATE products SET stock = ? WHERE id = ? AND stock >= 0", [stock, pid], callback);
};

// Delete product
const deleteProduct = (pid: number, callback: QueryCallback<UpdateResult>) => {
    pool.query("UPDATE products SET stock = -1 WHERE id = ?", [pid], callback);
};

// Update editable product fields
const updateProductDetails = (pid: number, product: ProductUpdateRecord, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `UPDATE products
        SET name = ?, description = ?, category_id = ?, brand_id = ?, specifications = ?, price = ?, sale_price = ?, stock = ?
        WHERE id = ?`,
        [
            product.name,
            product.description,
            product.categoryId,
            product.brandId,
            product.specifications,
            product.price,
            product.salePrice,
            product.stock,
            pid,
        ],
        callback
    );
};

// Get relevant products by product id (same category or brand)
const getRelevantProductsByProductId = (pid: number, limit: number, callback: QueryCallback<RelevantProductRow[]>) => {
    const sql = `
        SELECT p.id AS product_id, p.name AS product_name
        FROM products p
        JOIN products base ON base.id = ?
        LEFT JOIN (
            SELECT product_id, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
            FROM reviews
            GROUP BY product_id
        ) review_summary ON review_summary.product_id = p.id
        WHERE p.id <> base.id
            AND p.stock >= 0
            AND (p.category_id = base.category_id OR p.brand_id = base.brand_id)
        ORDER BY
            (p.category_id = base.category_id) DESC,
            (p.brand_id = base.brand_id) DESC,
            COALESCE(review_summary.rating, 0) DESC,
            p.id DESC
        LIMIT ?
    `;
    pool.query(sql, [pid, limit], callback);
};

const getRecommendedProductsByUserId = (uid: string, limit: number, callback: QueryCallback<ProductEditorRow[]>) => {
    const sql = `
        SELECT
            p.id,
            p.name,
            p.description,
            c.name AS category,
            b.name AS brand,
            p.price,
            p.sale_price,
            p.stock,
            p.main_image,
            p.specifications,
            COALESCE(review_summary.rating, 0) AS rating,
            COALESCE(review_summary.reviews, 0) AS reviews
        FROM products p
        JOIN categories c ON c.id = p.category_id
        JOIN brands b ON b.id = p.brand_id
        LEFT JOIN (
            SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
            FROM reviews
            GROUP BY product_id
        ) review_summary ON review_summary.product_id = p.id
        LEFT JOIN (
            SELECT oi.product_id, SUM(oi.quantity) AS sales
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.status <> 2
            GROUP BY oi.product_id
        ) sales_summary ON sales_summary.product_id = p.id
        WHERE p.stock > 0
        ORDER BY
            (
                CASE WHEN EXISTS (
                    SELECT 1
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    JOIN products purchased ON purchased.id = oi.product_id
                    WHERE o.user_id = ? AND purchased.category_id = p.category_id
                ) THEN 5 ELSE 0 END
                + CASE WHEN EXISTS (
                    SELECT 1
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    JOIN products purchased ON purchased.id = oi.product_id
                    WHERE o.user_id = ? AND purchased.brand_id = p.brand_id
                ) THEN 3 ELSE 0 END
                + CASE WHEN EXISTS (
                    SELECT 1
                    FROM wishlist w
                    WHERE w.user_id = ? AND w.product_id = p.id
                ) THEN 4 ELSE 0 END
                + COALESCE(sales_summary.sales, 0) * 0.2
                + COALESCE(review_summary.rating, 0)
            ) DESC,
            p.id DESC
        LIMIT ?
    `;
    pool.query(sql, [uid, uid, uid, limit], callback);
};

module.exports = {
    insertProduct,
    findCategoryByName,
    insertCategory,
    findBrandByName,
    insertBrand,
    getProductById,
    getAllProducts,
    getAllProductsPaginated,
    getProductsCount,
    getInventorySummary,
    deleteProduct,
    updateProductDetails,
    updateProductStock,
    getRelevantProductsByProductId,
    getRecommendedProductsByUserId,
};
