import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { assertSafeDatabaseTarget } from "./database-target.js";

export const resolveServerRoot = (moduleDirectory: string) => {
    const nearbyRoot = path.resolve(moduleDirectory, "../..");
    return fs.existsSync(path.join(nearbyRoot, "package.json"))
        ? nearbyRoot
        : path.resolve(moduleDirectory, "../../..");
};

type FileExists = (candidate: string) => boolean;
type ReadFile = (candidate: string) => string;

export const resolveEnvPath = (
    candidates: string[],
    fileExists: FileExists = fs.existsSync,
    readFile: ReadFile = (candidate) => fs.readFileSync(candidate, "utf8"),
) => candidates.find((candidate) => {
    if (!candidate || !fileExists(candidate)) {
        return false;
    }

    return /(^|\r?\n)\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(readFile(candidate));
});

const serverRoot = resolveServerRoot(__dirname);
const mode = process.env.NODE_ENV || "development";
const configuredEnvFile = process.env.DIGITAL_E_ENV_FILE?.trim();
const resolveConfiguredEnvPath = (value: string) => (path.isAbsolute(value) ? value : path.resolve(serverRoot, value));
const envCandidates = [
    configuredEnvFile ? resolveConfiguredEnvPath(configuredEnvFile) : "",
    path.resolve(serverRoot, `.env.${mode}.local`),
    path.resolve(serverRoot, ".env.local"),
    path.resolve(serverRoot, `.env.${mode}`),
    path.resolve(serverRoot, ".env"),
    path.resolve(process.cwd(), ".env"),
].filter((candidate, index, candidates) => Boolean(candidate) && candidates.indexOf(candidate) === index);

const envPath = resolveEnvPath(envCandidates);

dotenv.config(
    envPath
        ? {
            path: envPath,
        }
        : undefined,
);

export const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 4000),
    dbHost: process.env.DB_HOST || "",
    dbUser: process.env.DB_USER || "",
    dbPassword: process.env.DB_PASSWORD || "",
    dbName: process.env.DB_NAME || "",
    dbPort: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    dbSsl: process.env.DB_SSL === "true",
    dbSslCaPath: process.env.DB_SSL_CA_PATH || "",
    databaseUrl: process.env.DATABASE_URL || "",
    jwtSecret: process.env.JWT_SECRET_KEY || "",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET_KEY || "",
    csrfSecret: process.env.CSRF_SECRET || process.env.JWT_SECRET_KEY || "dev_csrf_secret",
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    clientUrl: process.env.CLIENT_URL || "",
    serverUrl: process.env.SERVER_URL || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "",
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN || "",
    dbQueryLog: process.env.DB_QUERY_LOG === "true",
    dbQueryLogThresholdMs: Number(process.env.DB_QUERY_LOG_THRESHOLD_MS || 200),
    dbExplainSlow: process.env.DB_EXPLAIN_SLOW === "true",
    searchApiKey: process.env.SEARCHAPI_KEY || "",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    redisUrl: process.env.REDIS_URL || "",
};

assertSafeDatabaseTarget({
    nodeEnv: env.nodeEnv,
    dbHost: env.dbHost,
    databaseUrl: env.databaseUrl,
    allowRemoteDatabase: process.env.ALLOW_REMOTE_DATABASE === "true",
});

export const isProduction = env.nodeEnv === "production";
