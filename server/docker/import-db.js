const path = require("path");

const dockerEnv = path.resolve(__dirname, "..", ".env.docker");
require("dotenv").config({ path: dockerEnv, override: true });

const fs = require("fs");
const mysql = require("mysql2/promise");

const host = process.env.DB_HOST || "localhost";
const port = parseInt(process.env.DB_PORT || "3307", 10);
const user = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD || "digital_e_root";
const database = process.env.DB_NAME || "defaultdb";
const dumpPath = path.resolve(
    __dirname,
    "..",
    process.env.DUMP_PATH || "src/database/migrations/defaultdb_2026-06-01_142319.sql",
);

(async () => {
    if (!fs.existsSync(dumpPath)) {
        console.error("Dump file not found:", dumpPath);
        process.exit(1);
    }

    let dump = fs.readFileSync(dumpPath, "utf8");
    dump = dump.replace(/SET @@GLOBAL\.GTID_PURGED=.*?;\s*\n/s, "");
    dump = `USE \`${database}\`;\n` + dump;

    console.log(`Importing ${dumpPath} into ${database} on ${host}:${port} ...`);

    const conn = await mysql.createConnection({
        host,
        port,
        user,
        password,
        multipleStatements: true,
    });

    await conn.query(dump);
    console.log("Import complete.");
    await conn.end();
})().catch((e) => {
    console.error("Import failed:", e.message);
    process.exit(1);
});
