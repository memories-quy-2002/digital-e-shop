const path = require("path");
const fs = require("fs");
const { put } = require("@vercel/blob");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local") });

const uploadsDir = path.join(__dirname, "src", "uploads");
const outPath = path.join(__dirname, "src", "database", "blob-uploads.json");
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error("BLOB_READ_WRITE_TOKEN missing");
  process.exit(1);
}

const files = fs.readdirSync(uploadsDir).filter((f) => f.toLowerCase().endsWith(".jpg"));

(async () => {
  const results = [];
  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const buffer = fs.readFileSync(filePath);
    const blobPath = `uploads/${file}`;
    try {
      const blob = await put(blobPath, buffer, { access: "public", token });
      results.push({ file, url: blob.url });
      console.log(`uploaded ${file}`);
    } catch (err) {
      results.push({ file, error: err?.message || String(err) });
      console.error(`failed ${file}`);
    }
  }
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`done. wrote ${outPath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
