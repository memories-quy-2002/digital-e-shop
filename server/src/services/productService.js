const { put } = require("@vercel/blob");
const Product = require("../models/productModel");
const util = require("util");
const pool = require("../config/db");
pool.query = util.promisify(pool.query);

function extractFileName(url) {
    const parts = url.split("/");
    return parts[parts.length - 1].split(".")[0];
}

async function addSingleProductService(data, file) {
    const { name, description, category, brand, specifications, price, inventory } = data;

    // Upload image to Vercel Blob
    const imageName = name.toLowerCase().replace(/ /g, "_").replace(/-/g, "_");
    const imageBuffer = file.buffer;
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is not set");

    const blob = await put(`uploads/${imageName}.jpg`, imageBuffer, { access: "public", token });
    const fileName = extractFileName(blob.url);

    // Transaction
    await pool.query("START TRANSACTION");

    try {
        // Ensure brand
        let brandId;
        const brandResults = await pool.query("SELECT id FROM brands WHERE name = ?", [brand]);
        if (brandResults.length > 0) {
            brandId = brandResults[0].id;
        } else {
            const insertBrand = await pool.query("INSERT INTO brands (name) VALUES (?)", [brand]);
            brandId = insertBrand.insertId;
        }

        // Ensure category
        let categoryId;
        const categoryResults = await pool.query("SELECT id FROM categories WHERE name = ?", [category]);
        if (categoryResults.length > 0) {
            categoryId = categoryResults[0].id;
        } else {
            const insertCategory = await pool.query("INSERT INTO categories (name) VALUES (?)", [category]);
            categoryId = insertCategory.insertId;
        }

        // Insert product
        await pool.query(
            `INSERT INTO products (name, description, main_image, category_id, brand_id, specifications, price, stock)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, description, fileName, categoryId, brandId, specifications, price, inventory]
        );

        await pool.query("COMMIT");
        return { msg: "Product added successfully" };
    } catch (err) {
        await pool.query("ROLLBACK");
        throw err;
    }
}

module.exports = { addSingleProductService };
