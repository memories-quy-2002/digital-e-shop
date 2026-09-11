const fs = require("node:fs");
const path = require("node:path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const mysql = require("mysql2/promise");
const {
    assertExplicitDemoSeedTarget,
    DESTRUCTIVE_DEMO_SEED_MODE,
} = require("../../config/database-target");
const { resolveDemoDatabaseSsl } = require("./databaseSsl.js");

const BASELINE_FILES = [
    path.resolve(__dirname, "..", "migrations", "defaultdb_2026-06-01_142319.sql"),
    path.resolve(__dirname, "..", "migrations", "2026-07-07-add-stripe-payment-support.sql"),
];

const quoteIdentifier = (identifier) => {
    if (typeof identifier !== "string" || identifier.length === 0) {
        throw new TypeError("SQL identifier must be a non-empty string");
    }

    return `\`${identifier.replaceAll("`", "``")}\``;
};

const sanitizeDump = (sql) =>
    String(sql)
        .replace(/SET @@GLOBAL\.GTID_PURGED=.*?;\s*/gis, "")
        .replace(/SET @MYSQLDUMP_TEMP_LOG_BIN\s*=\s*@@SESSION\.SQL_LOG_BIN;\s*/gi, "")
        .replace(/SET @@SESSION\.SQL_LOG_BIN\s*=\s*0;\s*/gi, "")
        .replace(/SET @@SESSION\.SQL_LOG_BIN\s*=\s*@MYSQLDUMP_TEMP_LOG_BIN;\s*/gi, "");

const getTableNames = async (connection) => {
    const [rows] = await connection.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    const tableNameKey = Object.keys(rows[0] || {}).find((key) => key.toLowerCase().startsWith("tables_in_"));

    if (rows.length > 0 && !tableNameKey) {
        throw new Error("Could not determine the table-name column while preparing the demo reset");
    }

    return rows.map((row) => String(row[tableNameKey]));
};

const dropAllTables = async (connection) => {
    const tableNames = await getTableNames(connection);

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
        for (const tableName of tableNames) {
            await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
        }
    } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    return tableNames;
};

const importBaseline = async (connection) => {
    for (const filePath of BASELINE_FILES) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Demo reset baseline file not found: ${filePath}`);
        }

        const sql = sanitizeDump(fs.readFileSync(filePath, "utf8"));
        await connection.query(sql);
        console.log(`Imported ${path.basename(filePath)}`);
    }
};

const clearAllTableData = async (connection) => {
    const tableNames = await getTableNames(connection);
    let clearedRows = 0;

    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
        for (const tableName of tableNames) {
            const [result] = await connection.query(`DELETE FROM ${quoteIdentifier(tableName)}`);
            clearedRows += Number(result.affectedRows || 0);
        }
    } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    return clearedRows;
};

const createPool = () =>
    mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        waitForConnections: true,
        connectionLimit: 2,
        queueLimit: 0,
        multipleStatements: true,
        ssl: resolveDemoDatabaseSsl(),
    });

const main = async () => {
    assertExplicitDemoSeedTarget({
        dbHost: process.env.DB_HOST,
        databaseUrl: process.env.DATABASE_URL,
        mode: process.env.DEMO_SEED_MODE,
        confirmation: process.env.DEMO_SEED_CONFIRMATION,
        allowRemoteDatabase: process.env.ALLOW_DESTRUCTIVE_DEMO_SEED === "true",
    });

    if (process.env.DEMO_SEED_MODE !== DESTRUCTIVE_DEMO_SEED_MODE) {
        throw new Error(`Demo reset requires DEMO_SEED_MODE=${DESTRUCTIVE_DEMO_SEED_MODE}`);
    }

    const pool = createPool();
    try {
        const connection = await pool.getConnection();
        try {
            const droppedTables = await dropAllTables(connection);
            console.log(`Dropped ${droppedTables.length} existing base tables from the selected database.`);
            await importBaseline(connection);
            const clearedRows = await clearAllTableData(connection);
            console.log(`Cleared ${clearedRows} baseline rows before running the demo seed.`);
        } finally {
            connection.release();
        }
    } finally {
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error(
            "Digital-E demo database reset failed:",
            error instanceof Error ? error.code || error.message || "unknown error" : String(error),
        );
        process.exitCode = 1;
    });
}

module.exports = {
    dropAllTables,
    clearAllTableData,
    getTableNames,
    main,
    quoteIdentifier,
    sanitizeDump,
};
