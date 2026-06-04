import type { AppRequest, AppResponse, CountRow, DbError, UpdateResult } from "#src/shared/interfaces/domain";
import type { ProductEditorRow } from "./products.types";
import { logger } from "#src/shared/utils/logger";
const productService = require("./products.service");
const Product = require("./products.repository");
const inventoryMovementService = require("#src/modules/inventory/inventory.service");
const { inventoryUpdateSchema, productCreateSchema, productUpdateSchema } = require("./products.validator");
const {
    getValidationMessage,
    parseBody,
} = require("#src/shared/validation/requestSchemas");
const multer = require("multer");
const { MongoClient, ServerApiVersion } = require("mongodb");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const DB_URI = process.env.MONGO_URI;

async function addSingleProduct(req: AppRequest, res: AppResponse) {
    upload.single("image")(req, res, async (err: Error | null) => {
        if (err) return res.status(400).json({ msg: "Error uploading file" });

        try {
            const payload = parseBody(productCreateSchema, req.body);
            const result = await productService.addSingleProductService(payload, req.file);
            res.status(200).json(result);
        } catch (error) {
            if (error?.name === "ZodError") {
                return res.status(400).json({ msg: getValidationMessage(error) });
            }
            const err = error as Error;
            logger.error(err);
            res.status(500).json({ msg: "Internal server error", error: err.message });
        }
    });
}

function getSingleProduct(req: AppRequest, res: AppResponse) {
    Product.getProductById(req.params.id, (err: DbError | null, results: ProductEditorRow[]) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(404).json({ msg: "Product not found" });
        res.status(200).json({ product: results[0], msg: "Get product successfully" });
    });
}

function getListProduct(req: AppRequest, res: AppResponse) {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const term = typeof req.query.term === "string" ? req.query.term.trim() : "";
    const categories =
        typeof req.query.categories === "string"
            ? req.query.categories.split(",").map((item: string) => item.trim()).filter(Boolean)
            : [];
    const brands =
        typeof req.query.brands === "string"
            ? req.query.brands.split(",").map((item: string) => item.trim()).filter(Boolean)
            : [];
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    const sortBy =
        typeof req.query.sortBy === "string"
            ? req.query.sortBy
            : "relevance";
    const filters = {
        term,
        categories,
        brands,
        minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
        sortBy,
    };
    const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
    const safeLimit = usePagination ? Math.min(limit, 100) : null;
    const offset = usePagination ? (page - 1) * safeLimit : 0;
    const useFilteredQuery =
        Boolean(term) ||
        categories.length > 0 ||
        brands.length > 0 ||
        Number.isFinite(minPrice) ||
        Number.isFinite(maxPrice) ||
        sortBy !== "relevance";

    if (useFilteredQuery) {
        const resolvedLimit = safeLimit || 100;
        Product.getProductsByFilters(filters, resolvedLimit, offset, (err: DbError | null, results: ProductEditorRow[]) => {
            if (err) return res.status(500).json({ msg: "Internal server error" });
            Product.countProductsByFilters(filters, (countErr: DbError | null, countResults: CountRow[]) => {
                if (countErr) return res.status(500).json({ msg: "Internal server error" });
                const total = countResults?.[0]?.total || 0;
                return res.status(200).json({
                    products: results || [],
                    pagination: {
                        page: usePagination ? page : 1,
                        limit: resolvedLimit,
                        total,
                        totalPages: Math.max(1, Math.ceil(total / resolvedLimit)),
                    },
                    msg: "Get list products successfully",
                });
            });
        });
        return;
    }

    if (usePagination) {
        Product.getAllProductsPaginated(safeLimit, offset, (err: DbError | null, results: ProductEditorRow[]) => {
            if (err) return res.status(500).json({ msg: "Internal server error" });
            Product.getProductsCount((countErr: DbError | null, countResults: CountRow[]) => {
                if (countErr) return res.status(500).json({ msg: "Internal server error" });
                const total = countResults?.[0]?.total || 0;
                if (results.length === 0) return res.status(204).json({ msg: "No product found" });
                return res.status(200).json({
                    products: results,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                    msg: "Get list products successfully",
                });
            });
        });
        return;
    }

    Product.getAllProducts((err: DbError | null, results: ProductEditorRow[]) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(204).json({ msg: "No product found" });
        res.status(200).json({ products: results, msg: "Get list products successfully" });
    });
}

function searchProducts(req: AppRequest, res: AppResponse) {
    const term = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limit = Math.min(Math.max(Number(req.query.limit) || 6, 1), 20);

    if (term.length < 2) {
        return res.status(200).json({ products: [], msg: "Search term too short" });
    }

    Product.searchProducts(term, limit, (err: DbError | null, results: ProductEditorRow[]) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        return res.status(200).json({ products: results || [], msg: "Search products successfully" });
    });
}

function getProductFacets(req: AppRequest, res: AppResponse) {
    Product.getProductFacets(
        (
            err: DbError | null,
            results?: {
                categories: Array<{ name: string }>;
                brands: Array<{ name: string }>;
                priceBounds: Array<{ min_price: number | null; max_price: number | null }>;
                totals: Array<{ total: number }>;
            },
        ) => {
            if (err) return res.status(500).json({ msg: "Internal server error" });
            const priceBounds = results?.priceBounds?.[0] || { min_price: 0, max_price: 0 };
            const totals = results?.totals?.[0] || { total: 0 };
            return res.status(200).json({
                facets: {
                    categories: (results?.categories || []).map((item) => item.name),
                    brands: (results?.brands || []).map((item) => item.name),
                    minPrice: Number(priceBounds.min_price) || 0,
                    maxPrice: Number(priceBounds.max_price) || 0,
                    totalProducts: Number(totals.total) || 0,
                },
                msg: "Get product facets successfully",
            });
        },
    );
}

function deleteProduct(req: AppRequest, res: AppResponse) {
    const { pid } = req.body;
    Product.deleteProduct(pid, (err: DbError | null) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        res.status(200).json({ msg: `Delete product with id = ${req.body.pid} successfully` });
    });
}

function getInventorySummary(req: AppRequest, res: AppResponse) {
    Product.getInventorySummary((err: DbError | null, results: Array<Record<string, number>>) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        const summary = results?.[0] || {};
        return res.status(200).json({
            summary: {
                total_products: Number(summary.total_products) || 0,
                out_of_stock: Number(summary.out_of_stock) || 0,
                low_stock: Number(summary.low_stock) || 0,
                healthy_stock: Number(summary.healthy_stock) || 0,
                total_units: Number(summary.total_units) || 0,
            },
            msg: "Inventory summary retrieved successfully",
        });
    });
}

function updateInventory(req: AppRequest, res: AppResponse) {
    const pid = Number(req.params.id);

    if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ msg: "Product id and stock must be valid" });
    }

    let stock: number;
    try {
        stock = parseBody(inventoryUpdateSchema, req.body).stock;
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }

    Product.getProductById(pid, (beforeErr: DbError | null, beforeRows: ProductEditorRow[]) => {
        if (beforeErr) return res.status(500).json({ msg: "Internal server error" });
        if (beforeRows.length === 0) return res.status(404).json({ msg: "Product not found" });
        const stockBefore = Number(beforeRows[0].stock) || 0;

        Product.updateProductStock(pid, stock, (err: DbError | null, result: UpdateResult) => {
            if (err) return res.status(500).json({ msg: "Internal server error" });
            if (result.affectedRows === 0) return res.status(404).json({ msg: "Product not found" });
            Product.getProductById(pid, (findErr: DbError | null, rows: ProductEditorRow[]) => {
                if (findErr) return res.status(500).json({ msg: "Internal server error" });
                inventoryMovementService.recordMovement({
                    productId: pid,
                    movementType: "manual_adjustment",
                    quantityChange: stock - stockBefore,
                    stockBefore,
                    stockAfter: stock,
                    note: "Inventory updated from admin quick restock",
                    actorId: req.user?.id || "admin",
                });
                return res.status(200).json({ product: rows[0], msg: "Inventory updated successfully" });
            });
        });
    });
}

async function updateProduct(req: AppRequest, res: AppResponse) {
    const pid = Number(req.params.id);

    if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ msg: "Invalid product id" });
    }

    try {
        const payload = parseBody(productUpdateSchema, req.body);
        const product = await productService.updateProductDetailsService(pid, {
            ...payload,
            actorId: req.user?.id || "admin",
        });
        return res.status(200).json({
            product,
            msg: "Product has been updated successfully",
        });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        const error = err as Error & { statusCode?: number };
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            msg: statusCode === 500 ? "Internal server error" : error.message,
        });
    }
}

async function retrieveRelevantProducts(req: AppRequest, res: AppResponse) {
    const pid = parseInt(String(req.params.pid), 10);
    if (!pid) {
        return res.status(400).json({ msg: "Invalid product id" });
    }

    const fetchFromMysql = () =>
        new Promise((resolve, reject) => {
            Product.getRelevantProductsByProductId(pid, 8, (err: DbError | null, results: ProductEditorRow[]) => {
                if (err) return reject(err);
                resolve(results || []);
            });
        });

    if (!DB_URI) {
        try {
            const fallbackResults = await fetchFromMysql();
            return res.status(200).json({
                relevantProducts: fallbackResults,
                msg: "Retrieved relevant products successfully (mysql)",
            });
        } catch (err) {
            const error = err as Error;
            logger.error({ err: error.message, pid }, "MySQL relevant products error");
            return res.status(500).json({ msg: "Error retrieving relevant products" });
        }
    }

    try {
        const client = new MongoClient(DB_URI, { serverApi: ServerApiVersion.v1 });
        await client.connect();
        const db = client.db("e_commerce");
        const collection = db.collection("relevant_product");
        const documents = await collection.find({ product_id: pid }).toArray();
        await client.close();

        if (documents.length > 0) {
            const mongoRelevantProducts = Array.isArray(documents[0].relevant_products)
                ? documents[0].relevant_products
                : [];
            const relevantIds = mongoRelevantProducts
                .map((item: unknown) => {
                    if (typeof item === "number") return item;
                    if (typeof item === "string") return Number(item);
                    if (item && typeof item === "object" && "product_id" in item) {
                        return Number((item as { product_id?: unknown }).product_id);
                    }
                    return 0;
                })
                .filter((item: number) => Number.isInteger(item) && item > 0);

            if (relevantIds.length > 0) {
                return Product.getProductsByIdsOrdered(relevantIds, (mysqlErr: DbError | null, mysqlResults: ProductEditorRow[]) => {
                    if (mysqlErr) {
                        logger.error({ err: mysqlErr.message, pid, relevantIds }, "Mongo id hydration error");
                        return res.status(500).json({ msg: "Error retrieving relevant products" });
                    }
                    return res.status(200).json({
                        relevantProducts: mysqlResults || [],
                        msg: "Retrieved relevant products successfully",
                    });
                });
            }

            return res.status(200).json({
                relevantProducts: [],
                msg: "Retrieved relevant products successfully",
            });
        }

        const fallbackResults = await fetchFromMysql();
        return res.status(200).json({
            relevantProducts: fallbackResults,
            msg: "Retrieved relevant products successfully (mysql fallback)",
        });
    } catch (err) {
        const error = err as Error;
        logger.error({ err: error.message, pid }, "Mongo relevant products error");
        try {
            const fallbackResults = await fetchFromMysql();
            return res.status(200).json({
                relevantProducts: fallbackResults,
                msg: "Retrieved relevant products successfully (mysql fallback)",
            });
        } catch (fallbackErr) {
            const error = fallbackErr as Error;
            logger.error({ err: error.message, pid }, "MySQL relevant products error");
            return res.status(500).json({ msg: "Error retrieving relevant products" });
        }
    }
}

function getRecommendations(req: AppRequest, res: AppResponse) {
    const uid = req.params.uid || "";
    const limit = Math.min(Number(req.query.limit) || 12, 24);

    Product.getRecommendedProductsByUserId(uid, limit, (err: DbError | null, results: ProductEditorRow[]) => {
        if (err) {
            logger.error({ err: err.message, uid, limit }, "Recommendation error");
            return res.status(500).json({ msg: "Unable to load recommendations" });
        }
        return res.status(200).json({
            products: results || [],
            msg: "Recommendations retrieved successfully",
        });
    });
}

module.exports = {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    searchProducts,
    getProductFacets,
    deleteProduct,
    getInventorySummary,
    updateInventory,
    updateProduct,
    retrieveRelevantProducts,
    getRecommendations,
};

