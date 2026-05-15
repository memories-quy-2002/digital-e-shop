import type { Request, Response } from "express";
import type { AppRequest, CountRow, DbError, ProductEditorRow, UpdateResult } from "../types/domain";
const productService = require("../services/productService");
const Product = require("../models/productModel");
const inventoryMovementService = require("../services/inventoryMovementService");
const multer = require("multer");
const { MongoClient, ServerApiVersion } = require("mongodb");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const DB_URI = process.env.MONGO_URI;

async function addSingleProduct(req: AppRequest, res: Response) {
    upload.single("image")(req, res, async (err: Error | null) => {
        if (err) return res.status(400).json({ msg: "Error uploading file" });

        try {
            const result = await productService.addSingleProductService(req.body, req.file);
            res.status(200).json(result);
        } catch (error) {
            const err = error as Error;
            console.error(err.message);
            res.status(500).json({ msg: "Internal server error", error: err.message });
        }
    });
}

function getSingleProduct(req: Request, res: Response) {
    Product.getProductById(req.params.id, (err: DbError | null, results: ProductEditorRow[]) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(404).json({ msg: "Product not found" });
        res.status(200).json({ product: results[0], msg: "Get product successfully" });
    });
}

function getListProduct(req: Request, res: Response) {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
    const safeLimit = usePagination ? Math.min(limit, 100) : null;
    const offset = usePagination ? (page - 1) * safeLimit : 0;

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

function deleteProduct(req: Request, res: Response) {
    const { pid } = req.body;
    Product.deleteProduct(pid, (err: DbError | null) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        res.status(200).json({ msg: `Delete product with id = ${req.body.pid} successfully` });
    });
}

function getInventorySummary(req: Request, res: Response) {
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

function updateInventory(req: AppRequest, res: Response) {
    const pid = Number(req.params.id);
    const stock = Number(req.body.stock);

    if (!Number.isInteger(pid) || pid <= 0 || !Number.isInteger(stock) || stock < 0) {
        return res.status(400).json({ msg: "Product id and stock must be valid" });
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

async function updateProduct(req: AppRequest, res: Response) {
    const pid = Number(req.params.id);

    if (!Number.isInteger(pid) || pid <= 0) {
        return res.status(400).json({ msg: "Invalid product id" });
    }

    try {
        const product = await productService.updateProductDetailsService(pid, {
            ...req.body,
            actorId: req.user?.id || "admin",
        });
        return res.status(200).json({
            product,
            msg: "Product has been updated successfully",
        });
    } catch (err) {
        const error = err as Error & { statusCode?: number };
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            msg: statusCode === 500 ? "Internal server error" : error.message,
        });
    }
}

async function retrieveRelevantProducts(req: Request, res: Response) {
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
            console.error("MySQL relevant products error: ", error.message);
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
            return res.status(200).json({
                relevantProducts: documents[0].relevant_products || [],
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
        console.error("Mongo relevant products error: ", error.message);
        try {
            const fallbackResults = await fetchFromMysql();
            return res.status(200).json({
                relevantProducts: fallbackResults,
                msg: "Retrieved relevant products successfully (mysql fallback)",
            });
        } catch (fallbackErr) {
            const error = fallbackErr as Error;
            console.error("MySQL relevant products error: ", error.message);
            return res.status(500).json({ msg: "Error retrieving relevant products" });
        }
    }
}

function getRecommendations(req: Request, res: Response) {
    const uid = req.params.uid || "";
    const limit = Math.min(Number(req.query.limit) || 12, 24);

    Product.getRecommendedProductsByUserId(uid, limit, (err: DbError | null, results: ProductEditorRow[]) => {
        if (err) {
            console.error("Recommendation error: ", err.message);
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
    deleteProduct,
    getInventorySummary,
    updateInventory,
    updateProduct,
    retrieveRelevantProducts,
    getRecommendations,
};
