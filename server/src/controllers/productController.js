const productService = require("../services/productService");
const Product = require("../models/productModel");
const multer = require("multer");
const { MongoClient, ServerApiVersion } = require("mongodb");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const DB_URI = process.env.MONGO_URI;

async function addSingleProduct(req, res) {
    upload.single("image")(req, res, async (err) => {
        if (err) return res.status(400).json({ msg: "Error uploading file" });

        try {
            const result = await productService.addSingleProductService(req.body, req.file);
            res.status(200).json(result);
        } catch (error) {
            console.error(error.message);
            res.status(500).json({ msg: "Internal server error", error: error.message });
        }
    });
}

function getSingleProduct(req, res) {
    Product.getProductById(req.params.id, (err, results) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(404).json({ msg: "Product not found" });
        res.status(200).json({ product: results[0], msg: "Get product successfully" });
    });
}

function getListProduct(req, res) {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
    const safeLimit = usePagination ? Math.min(limit, 100) : null;
    const offset = usePagination ? (page - 1) * safeLimit : 0;

    if (usePagination) {
        Product.getAllProductsPaginated(safeLimit, offset, (err, results) => {
            if (err) return res.status(500).json({ msg: "Internal server error" });
            Product.getProductsCount((countErr, countResults) => {
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

    Product.getAllProducts((err, results) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(204).json({ msg: "No product found" });
        res.status(200).json({ products: results, msg: "Get list products successfully" });
    });
}

function deleteProduct(req, res) {
    const { pid } = req.body;
    Product.deleteProduct(pid, (err) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        res.status(200).json({ msg: `Delete product with id = ${req.body.pid} successfully` });
    });
}

async function retrieveRelevantProducts(req, res) {
    const pid = parseInt(req.params.pid);
    if (!pid) {
        return res.status(400).json({ msg: "Invalid product id" });
    }

    const fetchFromMysql = () =>
        new Promise((resolve, reject) => {
            Product.getRelevantProductsByProductId(pid, 8, (err, results) => {
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
            console.error("MySQL relevant products error: ", err.message);
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
        console.error("Mongo relevant products error: ", err.message);
        try {
            const fallbackResults = await fetchFromMysql();
            return res.status(200).json({
                relevantProducts: fallbackResults,
                msg: "Retrieved relevant products successfully (mysql fallback)",
            });
        } catch (fallbackErr) {
            console.error("MySQL relevant products error: ", fallbackErr.message);
            return res.status(500).json({ msg: "Error retrieving relevant products" });
        }
    }
}

module.exports = {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    retrieveRelevantProducts,
};
