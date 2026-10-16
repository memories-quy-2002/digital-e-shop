import dotenv from "dotenv";
import mysql from "mysql2/promise";

const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (process.env.DIGITAL_E_ENV_FILE?.trim()) throw new Error("DIGITAL_E_ENV_FILE is not allowed for browser fixture preparation");
dotenv.config();

if (process.env.NODE_ENV === "production" || process.env.ALLOW_REMOTE_DATABASE === "true") throw new Error("Browser fixtures cannot use production or remote database overrides");
const dbName = process.env.DB_NAME?.trim();
const host = process.env.DB_HOST?.trim().toLowerCase();
const databaseUrl = new URL(process.env.DATABASE_URL || "");
const urlDatabase = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (dbName !== "retail_p0_test" || urlDatabase !== dbName || !allowedHosts.has(host) || !allowedHosts.has(databaseUrl.hostname.toLowerCase())) {
    throw new Error("Browser fixture preparation requires the isolated local retail_p0_test database");
}
if (process.env.EMAIL_PROVIDER_MODE !== "sandbox" || process.env.PAYMENT_PROVIDER_MODE !== "mock") {
    throw new Error("Browser fixtures require sandbox email and mock payments");
}

let connection;
try {
    connection = await mysql.createConnection({
        host,
        port: Number(process.env.DB_PORT || databaseUrl.port || 3306),
        user: process.env.DB_USER || decodeURIComponent(databaseUrl.username),
        password: process.env.DB_PASSWORD ?? decodeURIComponent(databaseUrl.password),
        database: dbName,
        connectTimeout: 5000,
    });
    const [rows] = await connection.query("SELECT DATABASE() AS name");
    if (rows[0]?.name !== "retail_p0_test") throw new Error("Connected database is outside the browser fixture allowlist");
    await connection.execute(
        "UPDATE products SET stock = GREATEST(stock, 100) WHERE id = 1",
    );
    const [products] = await connection.query("SELECT id FROM products WHERE id = 1");
    if (!products.length) throw new Error("Browser product fixture is missing from the cloned baseline");
    process.stdout.write("Prepared isolated internal-delivery retail P0 browser fixture (product 1).\n");
} catch {
    process.stderr.write("Could not prepare the isolated retail P0 browser fixture; database details were suppressed.\n");
    process.exitCode = 1;
} finally {
    await connection?.end().catch(() => {});
}
