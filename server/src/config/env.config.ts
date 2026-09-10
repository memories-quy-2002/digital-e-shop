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

export type AuthProvider = "local" | "firebase";

export const resolveAuthProvider = (nodeEnv: string, configuredProvider?: string): AuthProvider => {
    if (nodeEnv === "production") {
        return "firebase";
    }

    return configuredProvider?.trim().toLowerCase() === "firebase" ? "firebase" : "local";
};

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

const requiredProductionEnvironmentKeys = [
    "DATABASE_URL",
    "DB_HOST",
    "DB_USER",
    "DB_NAME",
    "JWT_SECRET_KEY",
    "JWT_REFRESH_SECRET_KEY",
    "CSRF_SECRET",
    "CLIENT_URL",
    "SERVER_URL",
] as const;

export const getMissingProductionEnvironmentKeys = (environment: NodeJS.ProcessEnv = process.env) =>
    requiredProductionEnvironmentKeys.filter((key) => !environment[key]?.trim());

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
    blobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN || "",
    dbQueryLog: process.env.DB_QUERY_LOG === "true",
    dbQueryLogThresholdMs: Number(process.env.DB_QUERY_LOG_THRESHOLD_MS || 200),
    dbExplainSlow: process.env.DB_EXPLAIN_SLOW === "true",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    payosClientId: process.env.PAYOS_CLIENT_ID || "",
    payosApiKey: process.env.PAYOS_API_KEY || "",
    payosChecksumKey: process.env.PAYOS_CHECKSUM_KEY || "",
    payosPartnerCode: process.env.PAYOS_PARTNER_CODE || "",
    payosBaseUrl: process.env.PAYOS_BASE_URL || "https://api-merchant.payos.vn",
    storeCurrency: (process.env.STORE_CURRENCY === "USD" ? "USD" : "VND") as "USD" | "VND",
    resendApiKey: process.env.RESEND_API_KEY || "",
    resendFromEmail: process.env.RESEND_FROM_EMAIL || "Digital-E <onboarding@resend.dev>",
    paymentProviderMode: process.env.PAYMENT_PROVIDER_MODE === "live" ? "live" : "mock",
    payosUsdToVndRate: process.env.PAYOS_USD_TO_VND_RATE ? Number(process.env.PAYOS_USD_TO_VND_RATE) : undefined,
    redisUrl: process.env.REDIS_URL || "",
    authProvider: resolveAuthProvider(mode, process.env.AUTH_PROVIDER),
};

const missingProductionEnvironmentKeys = getMissingProductionEnvironmentKeys();
if (env.nodeEnv === "production" && missingProductionEnvironmentKeys.length > 0) {
    throw new Error(
        `Missing required production environment variables: ${missingProductionEnvironmentKeys.join(", ")}`,
    );
}

assertSafeDatabaseTarget({
    nodeEnv: env.nodeEnv,
    dbHost: env.dbHost,
    databaseUrl: env.databaseUrl,
    allowRemoteDatabase: process.env.ALLOW_REMOTE_DATABASE === "true",
});

export const isProduction = env.nodeEnv === "production";
