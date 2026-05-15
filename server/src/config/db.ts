const mysql = require("mysql");
require("dotenv");

type QueryCallback = (err: Error | null, results?: unknown, fields?: unknown) => void;
type QueryInput = string | { sql: string; timeout?: number };
type QueryParams = unknown[] | Record<string, unknown> | undefined;
type QueryResult = { on: (event: string, callback: () => void) => void };
type DbConnection = { release: () => void };
type DbPool = {
    query: (sql: QueryInput, values?: QueryParams | QueryCallback, callback?: QueryCallback) => QueryResult | unknown;
    getConnection: (callback: (err: Error | null, connection: DbConnection) => void) => void;
};

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
}) as DbPool;

const originalQuery = pool.query.bind(pool);
const slowQueryThresholdMs = Number(process.env.DB_QUERY_LOG_THRESHOLD_MS) || 200;

const normalizeSql = (sqlText: unknown) => String(sqlText || "").replace(/\s+/g, " ").trim().replace(/;$/, "");
const isSelectQuery = (sqlText: unknown) => /^\s*select/i.test(String(sqlText || ""));

pool.query = (sql: QueryInput, values?: QueryParams | QueryCallback, callback?: QueryCallback) => {
    const start = process.hrtime.bigint();
    let params = values as QueryParams;
    let cb = callback;
    if (typeof values === "function") {
        cb = values;
        params = undefined;
    }

    const logIfNeeded = () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const sqlText = typeof sql === "object" ? sql.sql : String(sql);
        const compactSql = normalizeSql(sqlText);

        const shouldLog = process.env.DB_QUERY_LOG === "true" && durationMs >= slowQueryThresholdMs;
        if (shouldLog) {
            console.log(`[db] ${durationMs.toFixed(1)} ms | ${compactSql}`);
        }

        const shouldExplain =
            process.env.DB_EXPLAIN_SLOW === "true" &&
            durationMs >= slowQueryThresholdMs &&
            isSelectQuery(sqlText) &&
            !/^\s*explain/i.test(sqlText || "");

        if (shouldExplain) {
            const explainSql = `EXPLAIN ANALYZE ${compactSql}`;
            originalQuery(explainSql, params || [], (explainErr: Error | null, rows: unknown) => {
                if (explainErr) {
                    console.warn(`[db] EXPLAIN failed: ${explainErr.message}`);
                    return;
                }
                console.log(`[db] EXPLAIN ${compactSql}`);
                console.table(rows);
            });
        }
    };

    if (typeof cb === "function") {
        return originalQuery(sql, params, (err: Error | null, results: unknown, fields: unknown) => {
            logIfNeeded();
            return cb(err, results, fields);
        });
    }

    const result = originalQuery(sql, params) as QueryResult;
    result.on("end", logIfNeeded);
    return result;
};

pool.getConnection((err: Error | null, connection: DbConnection) => {
    if (err) {
        console.error("Error connecting to MySQL database:", err);
        return;
    }
    console.log("Connected to MySQL database!");
    connection.release();
});

module.exports = pool;
