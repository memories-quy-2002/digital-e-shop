import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbNameAllowlist = new Set(["retail_p0_test"]);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

function loadLocalEnvironment() {
    if (process.env.DIGITAL_E_ENV_FILE?.trim()) {
        throw new Error("DIGITAL_E_ENV_FILE is not allowed for the retail P0 sandbox command");
    }
    const envFile = path.join(serverRoot, ".env");
    if (fs.existsSync(envFile)) dotenv.config({ path: envFile });
    process.env.NODE_ENV ||= "development";
}

function readSafeTarget() {
    if (process.env.NODE_ENV === "production") throw new Error("The retail P0 sandbox command cannot run in production");
    if (process.env.ALLOW_REMOTE_DATABASE === "true") throw new Error("Remote database overrides are forbidden for the retail P0 sandbox command");

    const dbHost = process.env.DB_HOST?.trim().toLowerCase();
    const dbName = process.env.DB_NAME?.trim();
    const databaseUrlText = process.env.DATABASE_URL?.trim();
    if (!dbHost || !localHosts.has(dbHost)) throw new Error("DB_HOST must identify a local database");
    if (!dbName || !dbNameAllowlist.has(dbName)) throw new Error("DB_NAME must be the isolated retail_p0_test database");
    if (!databaseUrlText) throw new Error("DATABASE_URL is required for the disposable database check");

    let databaseUrl;
    try {
        databaseUrl = new URL(databaseUrlText);
    } catch {
        throw new Error("DATABASE_URL must be a valid MySQL URL");
    }
    const urlDatabase = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
    if (!/^mysql(?:\+mysql2)?:$/.test(databaseUrl.protocol)) throw new Error("DATABASE_URL must use the MySQL protocol");
    if (!localHosts.has(databaseUrl.hostname.toLowerCase())) throw new Error("DATABASE_URL must identify a local database");
    if (urlDatabase !== dbName || !dbNameAllowlist.has(urlDatabase)) throw new Error("DATABASE_URL must target the isolated retail_p0_test database");

    const dbPort = Number(process.env.DB_PORT || databaseUrl.port || 3306);
    if (!Number.isSafeInteger(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error("DB_PORT must be a valid TCP port");
    if (databaseUrl.port && Number(databaseUrl.port) !== dbPort) throw new Error("DB_PORT must match the local MySQL URL port");
    const urlUser = decodeURIComponent(databaseUrl.username);
    const urlPassword = decodeURIComponent(databaseUrl.password);
    const configuredUser = process.env.DB_USER?.trim();
    const configuredPassword = process.env.DB_PASSWORD;
    if (configuredUser && urlUser && configuredUser !== urlUser) throw new Error("DB_USER must match the local MySQL URL identity");
    if (configuredPassword && urlPassword && configuredPassword !== urlPassword) throw new Error("DB_PASSWORD must match the local MySQL URL identity");
    const user = configuredUser || urlUser;
    const password = configuredPassword ?? urlPassword;
    if (!user || !password) throw new Error("Local MySQL credentials are required");

    if (process.env.EMAIL_PROVIDER_MODE !== "sandbox") throw new Error("EMAIL_PROVIDER_MODE must explicitly be sandbox");
    if (process.env.PAYMENT_PROVIDER_MODE !== "mock") throw new Error("PAYMENT_PROVIDER_MODE must explicitly be mock");
    const emailFixture = process.env.EMAIL_SANDBOX_FIXTURE || "accepted";
    if (emailFixture !== "accepted") throw new Error("EMAIL_SANDBOX_FIXTURE must be accepted for deterministic acceptance");

    return { dbHost, dbName, dbPort, user, password, emailFixture };
}

async function verifyDatabaseTarget(target) {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: target.dbHost,
            port: target.dbPort,
            user: target.user,
            password: target.password,
            database: target.dbName,
            ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
            connectTimeout: 5000,
        });
        const [rows] = await connection.query("SELECT DATABASE() AS databaseName");
        if (rows[0]?.databaseName !== "retail_p0_test") throw new Error("Connected database did not match the disposable allowlist");
    } catch {
        throw new Error("Could not verify the disposable local MySQL target; connection details were suppressed");
    } finally {
        await connection?.end().catch(() => {});
    }
}

async function main() {
    loadLocalEnvironment();
    const target = readSafeTarget();
    await verifyDatabaseTarget(target);

    const childEnv = {
        ...process.env,
        NODE_ENV: "test",
        EMAIL_PROVIDER_MODE: "sandbox",
        PAYMENT_PROVIDER_MODE: "mock",
        EMAIL_SANDBOX_FIXTURE: target.emailFixture,
        DB_HOST: target.dbHost,
        DB_PORT: String(target.dbPort),
        DB_USER: target.user,
        DB_PASSWORD: target.password,
        DB_NAME: target.dbName,
    };
    const vitest = path.join(serverRoot, "node_modules", "vitest", "vitest.mjs");
    if (!fs.existsSync(vitest)) throw new Error("Server dependencies are missing; install the server package with pnpm first");

    process.stdout.write("Retail P0 preflight passed for internal delivery, isolated local database, and sandbox email/payment adapters.\n");
    const result = spawnSync(process.execPath, [
        vitest,
        "run",
        "--config",
        "vitest.integration.config.ts",
        "src/operations/__tests__/retail-p0.integration.test.ts",
        "--reporter=dot",
    ], { cwd: serverRoot, env: childEnv, stdio: "inherit", timeout: 120000 });
    if (result.error) throw new Error("Could not launch the retail P0 integration suite");
    process.exitCode = result.status ?? 1;
}

try {
    await main();
} catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Retail P0 sandbox acceptance failed"}\n`);
    process.exitCode = 1;
}
