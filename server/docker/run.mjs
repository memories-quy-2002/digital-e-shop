import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import databaseTarget from "../src/config/database-target.js";

const serverRoot = fileURLToPath(new URL("../", import.meta.url));

export function readDockerEnvironment(text, inherited = process.env) {
    const configured = parseEnv(text);
    const env = {
        ...inherited,
        DB_HOST: "127.0.0.1",
        DB_PORT: "3307",
        DB_USER: "root",
        DB_PASSWORD: "digital_e_root",
        DB_NAME: "digital_e_shop_local",
        ...configured,
        NODE_ENV: "development",
        ALLOW_REMOTE_DATABASE: "false",
    };
    const urlHost = env.DB_HOST.includes(":") ? `[${env.DB_HOST}]` : env.DB_HOST;
    env.DATABASE_URL = configured.DATABASE_URL || `mysql://${encodeURIComponent(env.DB_USER)}:${encodeURIComponent(env.DB_PASSWORD)}@${urlHost}:${env.DB_PORT}/${encodeURIComponent(env.DB_NAME)}`;
    return env;
}

export function buildDockerPlan(operation, env, root = serverRoot) {
    databaseTarget.assertLocalDatabaseTarget({ dbHost: env.DB_HOST, databaseUrl: env.DATABASE_URL });
    if (env.DATABASE_URL) {
        const url = new URL(env.DATABASE_URL);
        const host = String(env.DB_HOST).replace(/^\[|\]$/g, "").toLowerCase();
        if (url.protocol !== "mysql:"
            || url.hostname.replace(/^\[|\]$/g, "").toLowerCase() !== host
            || (url.port || "3306") !== String(env.DB_PORT)
            || decodeURIComponent(url.pathname.slice(1)) !== env.DB_NAME
            || decodeURIComponent(url.username) !== env.DB_USER
            || decodeURIComponent(url.password) !== env.DB_PASSWORD) {
            throw new Error("DATABASE_URL must match the local DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD settings.");
        }
    }
    const compose = ["compose", "--env-file", path.join(root, ".env.docker")];
    const prisma = path.join(root, "node_modules", "prisma", "build", "index.js");
    switch (operation) {
        case "up":
            return [{ command: "docker", args: [...compose, "up", "-d", "--wait"] }];
        case "down":
            return [{ command: "docker", args: [...compose, "down"] }];
        case "import": {
            const args = [...compose, "exec", "-T", "-e", "MYSQL_PWD", "mysql", "mysql", `-u${env.DB_USER}`, env.DB_NAME];
            return [
                { command: "docker", args, inputFile: path.join(root, "src/database/migrations/defaultdb_2026-06-01_142319.sql"), stripGtid: true },
                { command: "docker", args, inputFile: path.join(root, "src/database/migrations/2026-07-07-add-stripe-payment-support.sql") },
            ];
        }
        case "migrate":
            return [
                { command: process.execPath, args: [prisma, "migrate", "resolve", "--applied", "0_init", "--config", "prisma.config.ts"] },
                { command: process.execPath, args: [prisma, "migrate", "deploy", "--config", "prisma.config.ts"] },
            ];
        case "seed:mock":
            return [{ command: process.execPath, args: [path.join(root, "src/database/seeders/seed-mock-orders-reviews.js")], env: { MOCK_ORDER_COUNT: env.MOCK_ORDER_COUNT || "50", MOCK_REVIEW_COUNT: env.MOCK_REVIEW_COUNT || "50" } }];
        default:
            throw new Error(`Unknown Docker operation: ${operation}`);
    }
}

function main() {
    const env = readDockerEnvironment(readFileSync(path.join(serverRoot, ".env.docker"), "utf8"));
    for (const step of buildDockerPlan(process.argv[2], env)) {
        let input = step.inputFile ? readFileSync(step.inputFile, "utf8") : undefined;
        if (step.stripGtid) input = input.replace(/SET @@GLOBAL\.GTID_PURGED=[\s\S]*?;\s*/g, "");
        const result = spawnSync(step.command, step.args, {
            cwd: serverRoot,
            env: { ...env, MYSQL_PWD: env.DB_PASSWORD, DIGITAL_E_SEED_ENV_FILE: path.join(serverRoot, ".env.docker"), ...step.env },
            input,
            stdio: [input === undefined ? "inherit" : "pipe", "inherit", "inherit"],
        });
        if (result.error) throw result.error;
        if (result.status !== 0) {
            process.exitCode = result.status || 1;
            return;
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        main();
    } catch (error) {
        console.error("Local Docker operation failed:", error instanceof Error ? error.message : "unknown error");
        process.exitCode = 1;
    }
}
