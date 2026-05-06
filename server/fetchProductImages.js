const { put } = require("@vercel/blob");
const { readFileSync } = require("fs");
const { join } = require("path");
require("dotenv").config();

const SEARCH_API_KEY = process.env.SEARCHAPI_KEY;
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function readProducts(filePath) {
    const content = readFileSync(filePath, "utf-8");
    return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

async function fetchGoogleImages(query, numImages) {
    const params = new URLSearchParams({
        engine: "google_images",
        q: query,
        api_key: SEARCH_API_KEY,
        gl: "us",
        hl: "en",
    });

    const response = await fetch(`https://www.searchapi.io/api/v1/search?${params}`);

    if (!response.ok) {
        throw new Error(`SearchAPI error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return (data.images || []).slice(0, numImages);
}

async function downloadImage(imageUrl) {
    const response = await fetch(imageUrl);

    if (!response.ok) {
        throw new Error(`Failed to download image: ${response.status} from ${imageUrl}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    return { buffer, contentType };
}

async function uploadToVercelBlob(filename, buffer, contentType) {
    const blob = await put(filename, buffer, {
        access: "public",
        contentType,
        token: BLOB_READ_WRITE_TOKEN,
    });

    return blob;
}

function buildFilename(imageUrl, product, index) {
    try {
        const url = new URL(imageUrl);
        const ext = url.pathname.split(".").pop()?.split("?")[0] || "jpg";
        const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
        const safeProduct = product.replace(/[^a-z0-9]/gi, "-").toLowerCase();
        return `uploads/${safeProduct}.${safeExt}`;
    } catch {
        return `uploads/unknown.jpg`;
    }
}

async function processProduct(product, numImages) {
    console.log(`\n🔍 Searching images for: "${product}"`);
    const imageResults = await fetchGoogleImages(product, numImages);

    if (!imageResults.length) {
        console.warn(`  ⚠️ No images found for "${product}"`);
        return [];
    }

    console.log(`  📦 Found ${imageResults.length} images. Uploading...`);

    const uploadedImages = [];

    for (let i = 0; i < imageResults.length; i++) {
        const result = imageResults[i];

        // ✅ Correct structure: original.link for full-res, thumbnail as fallback
        const imageUrl = result.original?.link || result.thumbnail;

        if (!imageUrl) {
            console.warn(`  Skipping result ${i + 1}: no image URL found.`);
            continue;
        }

        try {
            const { buffer, contentType } = await downloadImage(imageUrl);
            const filename = buildFilename(imageUrl, product, i + 1);
            const blob = await uploadToVercelBlob(filename, buffer, contentType);

            uploadedImages.push({
                product,
                originalUrl: imageUrl,
                blobUrl: blob.url,
                filename,
                title: result.title || "",
                source: result.source?.name || "",
            });

            console.log(`  ✅ [${i + 1}/${imageResults.length}] Uploaded: ${blob.url}`);
        } catch (err) {
            console.error(`  ❌ [${i + 1}/${imageResults.length}] Failed: ${err.message}`);
        }
    }

    return uploadedImages;
}

async function main() {
    const filePath = join(process.cwd(), "products.txt");
    const products = readProducts(filePath);

    if (!products.length) {
        console.error("❌ No products found in products.txt");
        process.exit(1);
    }

    console.log(`📄 Found ${products.length} products in products.txt`);

    const allResults = [];

    for (const product of products) {
        try {
            const results = await processProduct(product, 3);
            allResults.push(...results);
        } catch (err) {
            console.error(`❌ Failed to process "${product}": ${err.message}`);
        }
    }

    console.log("\n🎉 All done! Summary:");
}

main().catch(console.error);