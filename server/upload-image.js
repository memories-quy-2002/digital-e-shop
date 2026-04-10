const fs = require("fs");
const axios = require("axios");
const pLimit = require("p-limit").default;
const mysql = require("mysql");
const { put } = require("@vercel/blob");
require("dotenv").config();

const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
    console.warn("Database environment variables are missing. Check your .env file.");
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    acquireTimeout: 10000,
});


const limit = pLimit(5);

// scoring
function scoreImage(img) {
    let score = 0;

    if (img.original_width > 1000) score += 3;
    if (img.original_width > 2000) score += 2;

    const ratio = img.original_width / img.original_height;
    if (ratio > 0.8 && ratio < 1.5) score += 2;

    if (img.source?.includes("apple.com")) score += 3;
    if (img.source?.includes("samsung.com")) score += 3;
    if (img.source?.includes("sony.com")) score += 3;

    if (img.original_width < 500) score -= 5;

    return score;
}

function pickBestImage(images) {
    return images
        .map(img => ({ ...img, score: scoreImage(img) }))
        .sort((a, b) => b.score - a.score)[0];
}

async function fetchImages(productName) {
    const res = await axios.get("https://serpapi.com/search.json", {
        params: {
            q: `${productName} official product white background`,
            tbm: "isch",
            api_key: process.env.SERP_API_KEY
        }
    });

    return res.data.images_results || [];
}

async function uploadImage(url, filename) {
    const res = await axios.get(url, {
        responseType: "arraybuffer"
    });

    const blob = await put(filename, res.data, {
        access: "public"
    });

    return blob.url;
}

function slugify(text) {
    return text
        .trim() // 🔥 bắt buộc
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

// 🔥 update pool
function queryAsync(sql, params) {
    return new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function updateProductImage(productName, imageUrl) {
    const rows = await queryAsync(
        "SELECT id FROM products WHERE name = ? LIMIT 1",
        [productName]
    );

    if (!rows.length) {
        console.log("Skip:", productName);
        return;
    }

    await queryAsync(
        "UPDATE products SET main_image = ? WHERE id = ?",
        [imageUrl, rows[0].id]
    );
}

async function processProduct(productName) {
    try {
        console.log("Processing:", productName);

        const images = await fetchImages(productName);

        if (!images.length) throw new Error("No images");

        const best = pickBestImage(images);

        const fileName = slugify(productName);

        const blobUrl = await uploadImage(best.original, `uploads/${slugify(productName)}.jpg`);

        await updateProductImage(productName, fileName);

    } catch (err) {
        console.error("Failed:", productName, err.message);
    }
}

async function main() {
    const products = await queryAsync(
        "SELECT name FROM products",
    );
    await Promise.all(
        products.map(p => limit(() => processProduct(p.name)))
    );

    console.log("DONE 🚀");
}

main();