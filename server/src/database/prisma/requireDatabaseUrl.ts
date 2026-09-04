import { assertSafeDatabaseTarget } from "../../config/database-target.js";

export function requireDatabaseUrl() {
    const databaseUrl = process.env.DATABASE_URL?.trim();

    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required");
    }

    assertSafeDatabaseTarget({
        nodeEnv: process.env.NODE_ENV || "development",
        dbHost: process.env.DB_HOST,
        databaseUrl,
    });

    return databaseUrl;
}
