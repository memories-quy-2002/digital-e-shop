import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const envCandidates = [
    path.resolve(__dirname, "../../../.env"),
    path.resolve(__dirname, "../../.env"),
    path.resolve(process.cwd(), ".env"),
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

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
    databaseUrl: process.env.DATABASE_URL || "",
    jwtSecret: process.env.JWT_SECRET_KEY || "",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET_KEY || "",
    csrfSecret: process.env.CSRF_SECRET || process.env.JWT_SECRET_KEY || "dev_csrf_secret",
    clientUrl: process.env.CLIENT_URL || "",
    serverUrl: process.env.SERVER_URL || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "",
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN || "",
    mongoUri: process.env.MONGO_URI || "",
    dbQueryLog: process.env.DB_QUERY_LOG === "true",
    dbQueryLogThresholdMs: Number(process.env.DB_QUERY_LOG_THRESHOLD_MS || 200),
    dbExplainSlow: process.env.DB_EXPLAIN_SLOW === "true",
    searchApiKey: process.env.SEARCHAPI_KEY || "",
};

export const isProduction = env.nodeEnv === "production";
