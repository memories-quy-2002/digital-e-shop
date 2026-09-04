import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
const prisma = require("#src/database/prisma/client");
import type { CountRow, IdNameRow, UpdateResult } from "#src/shared/interfaces/domain";
import type { ProductEditorRow, ProductFacetValueRow, ProductPriceBoundsRow } from "./products.types";

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

type ProductListFilters = {
    term?: string;
    categories?: string[];
    brands?: string[];
    minPrice?: number;
    maxPrice?: number;
    sortBy?: "relevance" | "price-asc" | "price-desc" | "rating-desc" | "newest";
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

const productBaseFrom = `
    FROM products
    JOIN categories ON categories.id = products.category_id
    JOIN brands ON brands.id = products.brand_id
    ${productRatingJoin}
`;

const getProductListWhere = (filters: ProductListFilters = {}) => {
    const conditions = ["products.stock >= 0"];
    const params: Array<string | number> = [];
    const normalizedTerm = filters.term?.trim().toLowerCase() || "";

    if (normalizedTerm) {
        const wildcard = `%${normalizedTerm}%`;
        conditions.push(`
            (
                LOWER(products.name) LIKE ?
                OR LOWER(brands.name) LIKE ?
                OR LOWER(categories.name) LIKE ?
                OR LOWER(COALESCE(products.description, '')) LIKE ?
            )
        `);
        params.push(wildcard, wildcard, wildcard, wildcard);
    }

    if (filters.categories && filters.categories.length > 0) {
        conditions.push(`categories.name IN (${filters.categories.map(() => "?").join(", ")})`);
        params.push(...filters.categories);
    }

    if (filters.brands && filters.brands.length > 0) {
        conditions.push(`brands.name IN (${filters.brands.map(() => "?").join(", ")})`);
        params.push(...filters.brands);
    }

    if (typeof filters.minPrice === "number" && Number.isFinite(filters.minPrice)) {
        conditions.push("COALESCE(products.sale_price, products.price) >= ?");
        params.push(filters.minPrice);
    }

    if (typeof filters.maxPrice === "number" && Number.isFinite(filters.maxPrice)) {
        conditions.push("COALESCE(products.sale_price, products.price) <= ?");
        params.push(filters.maxPrice);
    }

    return { normalizedTerm, whereClause: `WHERE ${conditions.join(" AND ")}`, params };
};

const getProductListOrderBy = (filters: ProductListFilters = {}) => {
    const normalizedTerm = filters.term?.trim().toLowerCase() || "";

    if (filters.sortBy === "price-asc") {
        return "ORDER BY COALESCE(products.sale_price, products.price) ASC, products.id DESC";
    }

    if (filters.sortBy === "price-desc") {
        return "ORDER BY COALESCE(products.sale_price, products.price) DESC, products.id DESC";
    }

    if (filters.sortBy === "rating-desc") {
        return "ORDER BY COALESCE(review_summary.rating, 0) DESC, COALESCE(review_summary.reviews, 0) DESC, products.id DESC";
    }

    if (normalizedTerm) {
        return `
            ORDER BY
                (
                    CASE WHEN LOWER(products.name) = ? THEN 140 ELSE 0 END
                    + CASE WHEN LOWER(products.name) LIKE ? THEN 80 ELSE 0 END
                    + CASE WHEN LOWER(brands.name) = ? THEN 34 ELSE 0 END
                    + CASE WHEN LOWER(categories.name) = ? THEN 26 ELSE 0 END
                    + CASE WHEN LOWER(CONCAT_WS(' ', products.name, brands.name, categories.name)) LIKE ? THEN 20 ELSE 0 END
                    + COALESCE(review_summary.rating, 0) * 4
                    + LEAST(COALESCE(review_summary.reviews, 0), 40) * 0.2
                    + CASE WHEN products.sale_price IS NOT NULL AND products.sale_price < products.price THEN 3 ELSE 0 END
                ) DESC,
                products.id DESC
        `;
    }

    return "ORDER BY products.id DESC";
};

const getProductListOrderParams = (filters: ProductListFilters = {}) => {
    const normalizedTerm = filters.term?.trim().toLowerCase() || "";
    if (
        !normalizedTerm ||
        filters.sortBy === "price-asc" ||
        filters.sortBy === "price-desc" ||
        filters.sortBy === "rating-desc"
    ) {
        return [];
    }

    return [normalizedTerm, `${normalizedTerm}%`, normalizedTerm, normalizedTerm, `%${normalizedTerm}%`];
};

@Injectable()
export class NestProductsRepository {
    insertProduct(product: ProductInsertRecord): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
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
                (err: Error | null, result: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result);
                },
            );
        });
    }

    findCategoryByName(category: string): Promise<IdNameRow[]> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT id FROM categories WHERE name = ?", [category], (err: Error | null, rows: IdNameRow[]) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    insertCategory(category: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query("INSERT INTO categories (name) VALUES (?)", [category], (err: Error | null, result: UpdateResult) => {
                if (err) return reject(err);
                resolve(result);
            });
        });
    }

    findBrandByName(brand: string): Promise<IdNameRow[]> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT id FROM brands WHERE name = ?", [brand], (err: Error | null, rows: IdNameRow[]) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    insertBrand(brand: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query("INSERT INTO brands (name) VALUES (?)", [brand], (err: Error | null, result: UpdateResult) => {
                if (err) return reject(err);
                resolve(result);
            });
        });
    }

    getProductById(pid: number): Promise<ProductEditorRow | null> {
        return new Promise((resolve, reject) => {
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
                (err: Error | null, rows: ProductEditorRow[]) => {
                    if (err) return reject(err);
                    resolve(rows.length > 0 ? rows[0] : null);
                },
            );
        });
    }

    getAllProducts(): Promise<ProductEditorRow[]> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT products.id, products.name, description, categories.name AS category,
                    brands.name AS brand, price, sale_price, stock, main_image,
                    specifications, ${productRatingSelect}
                ${productBaseFrom}
                WHERE products.stock >= 0
                ORDER BY products.id DESC`,
                (err: Error | null, rows: ProductEditorRow[]) => {
                    if (err) return reject(err);
                    resolve(rows);
                },
            );
        });
    }

    getAllProductsPaginated(limit: number, offset: number): Promise<ProductEditorRow[]> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT products.id, products.name, description, categories.name AS category,
                    brands.name AS brand, price, sale_price, stock, main_image,
                    specifications, ${productRatingSelect}
                ${productBaseFrom}
                WHERE products.stock >= 0
                ORDER BY products.id DESC
                LIMIT ? OFFSET ?`,
                [limit, offset],
                (err: Error | null, rows: ProductEditorRow[]) => {
                    if (err) return reject(err);
                    resolve(rows);
                },
            );
        });
    }

    getProductsByFilters(filters: ProductListFilters, limit: number, offset: number): Promise<ProductEditorRow[]> {
        const { whereClause, params } = getProductListWhere(filters);
        const orderByClause = getProductListOrderBy(filters);
        const orderParams = getProductListOrderParams(filters);

        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT products.id, products.name, description, categories.name AS category,
                    brands.name AS brand, price, sale_price, stock, main_image,
                    specifications, ${productRatingSelect}
                ${productBaseFrom}
                ${whereClause}
                ${orderByClause}
                LIMIT ? OFFSET ?`,
                [...params, ...orderParams, limit, offset],
                (err: Error | null, rows: ProductEditorRow[]) => {
                    if (err) return reject(err);
                    resolve(rows);
                },
            );
        });
    }

    countProductsByFilters(filters: ProductListFilters): Promise<number> {
        const { whereClause, params } = getProductListWhere(filters);

        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT COUNT(*) AS total
                ${productBaseFrom}
                ${whereClause}`,
                params,
                (err: Error | null, rows: CountRow[]) => {
                    if (err) return reject(err);
                    resolve(rows?.[0]?.total || 0);
                },
            );
        });
    }

    searchProducts(term: string, limit: number): Promise<ProductEditorRow[]> {
        return this.getProductsByFilters({ term, sortBy: "relevance" }, limit, 0);
    }

    getProductFacets(): Promise<{
        categories: string[];
        brands: string[];
        minPrice: number;
        maxPrice: number;
        totalProducts: number;
    }> {
        return (async () => {
            const [categories, brands, priceBoundsRows, totalProducts] = await Promise.all([
                prisma.$queryRawUnsafe(
                    `SELECT categories.name
                     FROM categories
                     JOIN products ON products.category_id = categories.id
                     WHERE products.stock >= 0
                     GROUP BY categories.name
                     ORDER BY categories.name ASC`,
                ) as Promise<ProductFacetValueRow[]>,
                prisma.$queryRawUnsafe(
                    `SELECT brands.name
                     FROM brands
                     JOIN products ON products.brand_id = brands.id
                     WHERE products.stock >= 0
                     GROUP BY brands.name
                     ORDER BY brands.name ASC`,
                ) as Promise<ProductFacetValueRow[]>,
                prisma.$queryRawUnsafe(
                    `SELECT
                        COALESCE(MIN(COALESCE(products.sale_price, products.price)), 0) AS min_price,
                        COALESCE(MAX(COALESCE(products.sale_price, products.price)), 0) AS max_price
                     FROM products
                     WHERE products.stock >= 0`,
                ) as Promise<ProductPriceBoundsRow[]>,
                prisma.product.count({ where: { stock: { gte: 0 } } }),
            ]);

            const priceBounds = priceBoundsRows?.[0] || { min_price: 0, max_price: 0 };

            return {
                categories: (categories || []).map((item) => item.name),
                brands: (brands || []).map((item) => item.name),
                minPrice: Number(priceBounds.min_price) || 0,
                maxPrice: Number(priceBounds.max_price) || 0,
                totalProducts: Number(totalProducts) || 0,
            };
        })();
    }

    getProductsCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT COUNT(*) AS total FROM products WHERE stock >= 0", (err: Error | null, rows: CountRow[]) => {
                if (err) return reject(err);
                resolve(rows?.[0]?.total || 0);
            });
        });
    }

    getInventorySummary(): Promise<Record<string, number>> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT
                    COUNT(*) AS total_products,
                    SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
                    SUM(CASE WHEN stock > 0 AND stock <= 5 THEN 1 ELSE 0 END) AS low_stock,
                    SUM(CASE WHEN stock > 5 THEN 1 ELSE 0 END) AS healthy_stock,
                    SUM(stock) AS total_units
                FROM products
                WHERE stock >= 0`,
                (err: Error | null, rows: Array<Record<string, number>>) => {
                    if (err) return reject(err);
                    resolve(rows?.[0] || {});
                },
            );
        });
    }

    updateProductStock(pid: number, stock: number): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query("UPDATE products SET stock = ? WHERE id = ? AND stock >= 0", [stock, pid], (err: Error | null, result: UpdateResult) => {
                if (err) return reject(err);
                resolve(result);
            });
        });
    }

    deleteProduct(pid: number): Promise<void> {
        return new Promise((resolve, reject) => {
            pool.query("UPDATE products SET stock = -1 WHERE id = ?", [pid], (err: Error | null) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    updateProductDetails(pid: number, product: ProductUpdateRecord): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
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
                (err: Error | null, result: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result);
                },
            );
        });
    }

    getRelevantProductsByProductId(pid: number, limit: number): Promise<ProductEditorRow[]> {
        const sql = `
            SELECT
                p.id,
                p.name,
                p.description,
                categories.name AS category,
                brands.name AS brand,
                p.price,
                p.sale_price,
                p.stock,
                p.main_image,
                p.specifications,
                COALESCE(review_summary.rating, 0) AS rating,
                COALESCE(review_summary.reviews, 0) AS reviews
            FROM products p
            JOIN products base ON base.id = ?
            JOIN categories ON categories.id = p.category_id
            JOIN brands ON brands.id = p.brand_id
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
            LEFT JOIN (
                SELECT oi2.product_id, COUNT(DISTINCT oi.order_id) AS copurchase_count
                FROM order_items oi
                JOIN order_items oi2 ON oi2.order_id = oi.order_id AND oi2.product_id <> oi.product_id
                JOIN orders o ON o.id = oi.order_id
                WHERE oi.product_id = ? AND o.status <> 2
                GROUP BY oi2.product_id
            ) copurchase ON copurchase.product_id = p.id
            WHERE p.id <> base.id
                AND p.stock > 0
            ORDER BY
                (
                    COALESCE(copurchase.copurchase_count, 0) * 15
                    + CASE WHEN p.category_id = base.category_id THEN 9 ELSE 0 END
                    + CASE WHEN p.brand_id = base.brand_id THEN 5 ELSE 0 END
                    + COALESCE(review_summary.rating, 0) * 3
                    + LEAST(COALESCE(review_summary.reviews, 0), 40) * 0.15
                    + LEAST(COALESCE(sales_summary.sales, 0), 120) * 0.08
                    - ABS(COALESCE(p.sale_price, p.price) - COALESCE(base.sale_price, base.price)) * 0.01
                ) DESC,
                p.id DESC
            LIMIT ?
        `;
        return new Promise((resolve, reject) => {
            pool.query(sql, [pid, pid, limit], (err: Error | null, rows: ProductEditorRow[]) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }

    getRecommendedProductsByUserId(uid: string, limit: number): Promise<ProductEditorRow[]> {
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
            LEFT JOIN (
                SELECT source.category_id, SUM(source.weight) AS category_score
                FROM (
                    SELECT purchased.category_id, COUNT(*) * 3 AS weight
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    JOIN products purchased ON purchased.id = oi.product_id
                    WHERE o.user_id = ? AND o.status <> 2
                    GROUP BY purchased.category_id
                    UNION ALL
                    SELECT wished.category_id, COUNT(*) * 2 AS weight
                    FROM wishlist w
                    JOIN products wished ON wished.id = w.product_id
                    WHERE w.user_id = ?
                    GROUP BY wished.category_id
                    UNION ALL
                    SELECT cart_products.category_id, COUNT(*) AS weight
                    FROM carts c
                    JOIN cart_items ci ON ci.cart_id = c.id
                    JOIN products cart_products ON cart_products.id = ci.product_id
                    WHERE c.user_id = ?
                    GROUP BY cart_products.category_id
                ) source
                GROUP BY source.category_id
            ) category_affinity ON category_affinity.category_id = p.category_id
            LEFT JOIN (
                SELECT source.brand_id, SUM(source.weight) AS brand_score
                FROM (
                    SELECT purchased.brand_id, COUNT(*) * 2 AS weight
                    FROM orders o
                    JOIN order_items oi ON oi.order_id = o.id
                    JOIN products purchased ON purchased.id = oi.product_id
                    WHERE o.user_id = ? AND o.status <> 2
                    GROUP BY purchased.brand_id
                    UNION ALL
                    SELECT wished.brand_id, COUNT(*) * 2 AS weight
                    FROM wishlist w
                    JOIN products wished ON wished.id = w.product_id
                    WHERE w.user_id = ?
                    GROUP BY wished.brand_id
                    UNION ALL
                    SELECT cart_products.brand_id, COUNT(*) AS weight
                    FROM carts c
                    JOIN cart_items ci ON ci.cart_id = c.id
                    JOIN products cart_products ON cart_products.id = ci.product_id
                    WHERE c.user_id = ?
                    GROUP BY cart_products.brand_id
                ) source
                GROUP BY source.brand_id
            ) brand_affinity ON brand_affinity.brand_id = p.brand_id
            WHERE p.stock > 0
            ORDER BY
                (
                    COALESCE(category_affinity.category_score, 0) * 4
                    + COALESCE(brand_affinity.brand_score, 0) * 3
                    + COALESCE(sales_summary.sales, 0) * 0.18
                    + COALESCE(review_summary.rating, 0) * 3
                    + LEAST(COALESCE(review_summary.reviews, 0), 60) * 0.12
                    + CASE WHEN p.sale_price IS NOT NULL AND p.sale_price < p.price THEN 3 ELSE 0 END
                ) DESC,
                p.id DESC
            LIMIT ?
        `;
        return new Promise((resolve, reject) => {
            pool.query(sql, [uid, uid, uid, uid, uid, uid, limit], (err: Error | null, rows: ProductEditorRow[]) => {
                if (err) return reject(err);
                resolve(rows);
            });
        });
    }
}
