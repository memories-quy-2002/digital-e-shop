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
    Product.getAllProducts((err, results) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        if (results.length === 0) return res.status(204).json({ msg: "No product found" });
        res.status(200).json({ products: results, msg: "Get list products successfully" });
    });
}

function deleteProduct(req, res) {
    Product.deleteProduct(req.body.pid, (err) => {
        if (err) return res.status(500).json({ msg: "Internal server error" });
        res.status(200).json({ msg: `Delete product with id = ${req.body.pid} successfully` });
    });
}

async function retrieveRelevantProducts(req, res) {
    try {
        const client = new MongoClient(DB_URI, { serverApi: ServerApiVersion.v1 });
        await client.connect();
        const db = client.db("e_commerce");
        const collection = db.collection("relevant_product");
        const documents = await collection.find({ product_id: parseInt(req.params.pid) }).toArray();
        await client.close();

        res.status(200).json({
            relevantProducts: documents.length > 0 ? documents[0].relevant_products : [],
            msg: "Retrieved relevant products successfully",
        });
    } catch (err) {
        console.error("Error: ", err.message);
        res.status(500).json({ msg: "Error retrieving relevant products" });
    }
}

module.exports = {
    addSingleProduct,
    getSingleProduct,
    getListProduct,
    deleteProduct,
    retrieveRelevantProducts,
};
