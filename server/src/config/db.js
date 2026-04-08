const mysql = require("mysql");
require("dotenv");

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
});

const originalQuery = pool.query.bind(pool);
const slowQueryThresholdMs = Number(process.env.DB_QUERY_LOG_THRESHOLD_MS) || 200;

const normalizeSql = (sqlText) => String(sqlText || "").replace(/\s+/g, " ").trim().replace(/;$/, "");
const isSelectQuery = (sqlText) => /^\s*select/i.test(sqlText || "");

pool.query = (sql, values, callback) => {
    const start = process.hrtime.bigint();
    let params = values;
    let cb = callback;
    if (typeof values === "function") {
        cb = values;
        params = undefined;
    }

    const logIfNeeded = () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const sqlText = typeof sql === "object" ? sql.sql : sql;
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
            const explainSql = `EXPLAIN ${compactSql}`;
            originalQuery(explainSql, params || [], (explainErr, rows) => {
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
        return originalQuery(sql, params, (err, results, fields) => {
            logIfNeeded();
            return cb(err, results, fields);
        });
    }

    const result = originalQuery(sql, params);
    result.on("end", logIfNeeded);
    return result;
};

pool.getConnection((err, connection) => {
    if (err) {
        console.error("Error connecting to MySQL database:", err);
        return;
    }
    console.log("Connected to MySQL database!");
    connection.release();
});

module.exports = pool;
