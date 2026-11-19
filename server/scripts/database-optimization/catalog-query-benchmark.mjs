import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULTS = {
    products: 5000,
    reviewsPerProduct: 20,
    reservationRate: 0.1,
    warmups: 3,
    runs: 15,
};
const identifier = (value) => `\`${value}\``;

function parseArgs(argv) {
    const options = { ...DEFAULTS, out: null };
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (token === "--help" || token === "-h") options.help = true;
        else if (
            [
                "--products",
                "--reviews-per-product",
                "--reservation-rate",
                "--warmups",
                "--runs",
                "--out",
            ].includes(token)
        ) {
            const value = argv[index + 1];
            if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
            index += 1;
            if (token === "--out") options.out = value;
            else {
                const key = token
                    .slice(2)
                    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                options[key] = Number(value);
                if (!Number.isFinite(options[key])) throw new Error(`Invalid number for ${token}`);
            }
        } else throw new Error(`Unknown option: ${token}`);
    }
    if (options.products < 100 || options.products > 100000)
        throw new Error("--products must be from 100 to 100000");
    if (options.reviewsPerProduct < 0 || options.reviewsPerProduct > 500)
        throw new Error("--reviews-per-product must be from 0 to 500");
    if (options.products * options.reviewsPerProduct > 1_000_000)
        throw new Error("The generated review fixture is capped at 1,000,000 rows.");
    if (options.reservationRate < 0 || options.reservationRate > 1)
        throw new Error("--reservation-rate must be from 0 to 1");
    if (options.warmups < 0 || options.warmups > 20)
        throw new Error("--warmups must be from 0 to 20");
    if (options.runs < 3 || options.runs > 100) throw new Error("--runs must be from 3 to 100");
    return options;
}

function validateTarget(env) {
    if (env.CATALOG_BENCH_ALLOW_DISPOSABLE !== "1") {
        throw new Error(
            "Refusing database access. Set CATALOG_BENCH_ALLOW_DISPOSABLE=1 only for a disposable local MySQL database.",
        );
    }
    if (env.NODE_ENV === "production") throw new Error("Refusing NODE_ENV=production.");
    const host = (env.DB_HOST || "").toLowerCase();
    if (!["127.0.0.1", "localhost", "::1"].includes(host))
        throw new Error("DB_HOST must be loopback (127.0.0.1, localhost, or ::1).");
    if (!/^catalog_bench_[a-z0-9_]{1,38}$/i.test(env.DB_NAME || "")) {
        throw new Error(
            "DB_NAME must be a dedicated catalog_bench_<name> schema; the script will never create or drop a schema.",
        );
    }
    if (!env.DB_USER) throw new Error("DB_USER is required.");
}

function percentile(values, percentileValue) {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

function summary(values) {
    return {
        minMs: Number(Math.min(...values).toFixed(3)),
        medianMs: Number(percentile(values, 50).toFixed(3)),
        p95Ms: Number(percentile(values, 95).toFixed(3)),
        maxMs: Number(Math.max(...values).toFixed(3)),
        samples: values.length,
    };
}

function stableRows(rows) {
    return rows.map((row) => ({
        id: Number(row.id),
        rating: Number(row.rating),
        reviews: Number(row.reviews),
        available_stock: Number(row.available_stock),
    }));
}

function createQueries(tables, productCount) {
    const products = identifier(tables.products);
    const reviews = identifier(tables.reviews);
    const checkouts = identifier(tables.checkouts);
    const reservations = identifier(tables.reservations);
    const legacy = (where, order = "", limit = "") => `
        SELECT p.id,
            COALESCE(review_summary.rating, 0) AS rating,
            COALESCE(review_summary.reviews, 0) AS reviews,
            GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock
        FROM ${products} p
        LEFT JOIN (
            SELECT product_id, COUNT(*) AS reviews, ROUND(COALESCE(AVG(rating), 0), 1) AS rating
            FROM ${reviews} GROUP BY product_id
        ) review_summary ON review_summary.product_id = p.id
        LEFT JOIN (
            SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
            FROM ${reservations} ir
            JOIN ${checkouts} pc ON pc.id = ir.pending_checkout_id
            WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
            GROUP BY ir.product_id
        ) active_reservations ON active_reservations.product_id = p.id
        ${where} ${order} ${limit}`;
    const scoped = (where, order = "", limit = "") => `
        SELECT p.id,
            COALESCE((SELECT ROUND(AVG(r.rating), 1) FROM ${reviews} r WHERE r.product_id = p.id), 0) AS rating,
            (SELECT COUNT(*) FROM ${reviews} r WHERE r.product_id = p.id) AS reviews,
            GREATEST(p.stock - COALESCE((
                SELECT SUM(ir.quantity)
                FROM ${reservations} ir
                JOIN ${checkouts} pc ON pc.id = ir.pending_checkout_id
                WHERE ir.product_id = p.id AND pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
            ), 0), 0) AS available_stock
        FROM ${products} p ${where} ${order} ${limit}`;
    const pageSize = Math.min(50, Math.max(10, Math.floor(productCount * 0.002)));
    const comparisonIds = [1, Math.floor(productCount / 2), productCount].filter(
        (id, index, ids) => ids.indexOf(id) === index,
    );
    const comparisonPlaceholders = comparisonIds.map(() => "?").join(", ");
    return [
        {
            name: "product-detail",
            kind: "optimized",
            params: [Math.floor(productCount / 2)],
            before: legacy("WHERE p.id = ?"),
            after: scoped("WHERE p.id = ?"),
        },
        {
            name: "product-comparison",
            kind: "optimized",
            params: comparisonIds,
            before: legacy(`WHERE p.id IN (${comparisonPlaceholders})`),
            after: scoped(`WHERE p.id IN (${comparisonPlaceholders})`),
        },
        {
            name: "storefront-page",
            kind: "optimized",
            params: [pageSize, 0],
            before: legacy("", "ORDER BY p.id DESC", "LIMIT ? OFFSET ?"),
            after: scoped("", "ORDER BY p.id DESC", "LIMIT ? OFFSET ?"),
        },
        {
            name: "admin-page",
            kind: "optimized",
            params: [pageSize, Math.floor(pageSize * 2)],
            before: legacy("WHERE p.stock >= 0", "ORDER BY p.id DESC", "LIMIT ? OFFSET ?"),
            after: scoped("WHERE p.stock >= 0", "ORDER BY p.id DESC", "LIMIT ? OFFSET ?"),
        },
        {
            name: "filtered-rating-list-control",
            kind: "unchanged-control",
            params: [pageSize],
            before: legacy(
                "WHERE p.stock >= 0",
                "ORDER BY rating DESC, reviews DESC, p.id DESC",
                "LIMIT ?",
            ),
            after: legacy(
                "WHERE p.stock >= 0",
                "ORDER BY rating DESC, reviews DESC, p.id DESC",
                "LIMIT ?",
            ),
        },
    ];
}

async function insertBatches(connection, table, columns, rows, chunkSize = 1000) {
    const placeholders = `(${columns.map(() => "?").join(",")})`;
    for (let start = 0; start < rows.length; start += chunkSize) {
        const batch = rows.slice(start, start + chunkSize);
        await connection.query(
            `INSERT INTO ${identifier(table)} (${columns.map(identifier).join(",")}) VALUES ${batch.map(() => placeholders).join(",")}`,
            batch.flat(),
        );
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        process.stdout.write(
            "Disposable local catalog query benchmark\n\nRequires CATALOG_BENCH_ALLOW_DISPOSABLE=1, NODE_ENV!=production, loopback DB_HOST, DB_NAME=catalog_bench_<name>, DB_USER, and optional DB_PASSWORD/DB_PORT.\nCreates/drops only uniquely named fixture tables, never the schema.\nOptions: --products 5000 --reviews-per-product 20 --reservation-rate 0.1 --warmups 3 --runs 15 --out <json-path>\n",
        );
        return;
    }
    validateTarget(process.env);
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || "",
        database: process.env.DB_NAME,
        connectTimeout: 5000,
        multipleStatements: false,
    });
    let runId = randomBytes(4).toString("hex");
    let tables;
    const ownedTables = [];
    let cleanupComplete = false;

    try {
        let matches;
        do {
            const tablePrefix = `bench_${runId}`;
            tables = {
                products: `${tablePrefix}_products`,
                reviews: `${tablePrefix}_reviews`,
                checkouts: `${tablePrefix}_checkouts`,
                reservations: `${tablePrefix}_reservations`,
            };
            [matches] = await connection.execute(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (?, ?, ?, ?)",
                Object.values(tables),
            );
            if (matches.length) runId = randomBytes(4).toString("hex");
        } while (matches.length);

        const [[versionRow]] = await connection.query("SELECT VERSION() AS version");
        const version = String(versionRow.version);
        const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
        if (
            !match ||
            version.toLowerCase().includes("mariadb") ||
            Number(match[1]) < 8 ||
            (Number(match[1]) === 8 && Number(match[2]) === 0 && Number(match[3]) < 18)
        ) {
            throw new Error(
                `MySQL 8.0.18+ is required for EXPLAIN ANALYZE; server reports ${version}.`,
            );
        }
        const [[databaseRow]] = await connection.query("SELECT DATABASE() AS name");
        if (databaseRow.name !== process.env.DB_NAME)
            throw new Error("Connected schema did not match DB_NAME.");

        const createTable = async (name, definition) => {
            await connection.query(`CREATE TABLE ${identifier(name)} ${definition} ENGINE=InnoDB`);
            ownedTables.push(identifier(name));
        };
        await createTable(
            tables.products,
            "(id INT NOT NULL PRIMARY KEY, stock INT NOT NULL, KEY idx_stock_id (stock, id))",
        );
        await createTable(
            tables.reviews,
            "(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, rating TINYINT NOT NULL, KEY idx_product (product_id))",
        );
        await createTable(
            tables.checkouts,
            "(id INT NOT NULL PRIMARY KEY, status VARCHAR(20) NOT NULL, expires_at DATETIME NOT NULL, KEY idx_status_expiry (status, expires_at))",
        );
        await createTable(
            tables.reservations,
            "(id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY, pending_checkout_id INT NOT NULL, product_id INT NOT NULL, quantity INT NOT NULL, KEY idx_product (product_id), UNIQUE KEY uq_checkout_product (pending_checkout_id, product_id))",
        );

        const productRows = Array.from({ length: options.products }, (_, index) => [
            index + 1,
            5 + ((index * 7) % 96),
        ]);
        await insertBatches(connection, tables.products, ["id", "stock"], productRows);
        const reviewRows = [];
        for (let productId = 1; productId <= options.products; productId += 1) {
            if (productId % 19 === 0) continue;
            for (let review = 0; review < options.reviewsPerProduct; review += 1)
                reviewRows.push([productId, 1 + ((productId + review * 3) % 5)]);
        }
        await insertBatches(connection, tables.reviews, ["product_id", "rating"], reviewRows);
        const checkoutRows = [];
        const reservationRows = [];
        for (let productId = 1; productId <= options.products; productId += 1) {
            if ((productId * 7919) % 10000 < options.reservationRate * 10000) {
                const active = productId % 10 !== 0;
                const checkoutId = productId;
                const status = productId % 20 === 0 ? "COMPLETED" : "PENDING";
                const expiresAt = !active ? "2000-01-01 00:00:00" : "2099-01-01 00:00:00";
                checkoutRows.push([checkoutId, status, expiresAt]);
                reservationRows.push([checkoutId, productId, 1 + (productId % 3)]);
            }
        }
        await insertBatches(
            connection,
            tables.checkouts,
            ["id", "status", "expires_at"],
            checkoutRows,
        );
        await insertBatches(
            connection,
            tables.reservations,
            ["pending_checkout_id", "product_id", "quantity"],
            reservationRows,
        );
        await connection.query(`ANALYZE TABLE ${Object.values(tables).map(identifier).join(", ")}`);
        const [[reservationCounts]] = await connection.query(
            `SELECT COUNT(*) AS total, SUM(status = 'PENDING' AND expires_at > UTC_TIMESTAMP()) AS active FROM ${identifier(tables.checkouts)}`,
        );

        const queries = createQueries(tables, options.products);
        const output = {
            schema: process.env.DB_NAME,
            databaseVersion: version,
            target: `${process.env.DB_HOST}:${Number(process.env.DB_PORT || 3306)}`,
            generatedAt: new Date().toISOString(),
            dataset: {
                products: productRows.length,
                reviews: reviewRows.length,
                productsWithoutReviews:
                    productRows.length - new Set(reviewRows.map(([productId]) => productId)).size,
                reviewRowsPerProduct: options.reviewsPerProduct,
                checkouts: checkoutRows.length,
                reservations: reservationRows.length,
                activeReservations: Number(reservationCounts.active || 0),
                reservationRate: options.reservationRate,
                runIdHash: createHash("sha256").update(runId).digest("hex").slice(0, 12),
            },
            methodology: {
                warmups: options.warmups,
                measuredRuns: options.runs,
                beforeAfterOrderAlternates: true,
                comparison: "same fixture rows; result parity checked before timing",
            },
            cases: [],
        };

        for (const queryCase of queries) {
            const [beforeRows] = await connection.execute(queryCase.before, queryCase.params);
            const [afterRows] = await connection.execute(queryCase.after, queryCase.params);
            const beforeCanonical = stableRows(beforeRows);
            const afterCanonical = stableRows(afterRows);
            if (JSON.stringify(beforeCanonical) !== JSON.stringify(afterCanonical))
                throw new Error(`${queryCase.name}: legacy/current result mismatch`);
            const [beforePlanRows] = await connection.execute(
                `EXPLAIN ANALYZE ${queryCase.before}`,
                queryCase.params,
            );
            const [afterPlanRows] = await connection.execute(
                `EXPLAIN ANALYZE ${queryCase.after}`,
                queryCase.params,
            );
            const planText = (planRows) =>
                planRows.map((row) => Object.values(row).join(" ")).join("\n");
            const timings = { before: [], after: [] };
            for (let iteration = 0; iteration < options.warmups + options.runs; iteration += 1) {
                const order = iteration % 2 === 0 ? ["before", "after"] : ["after", "before"];
                for (const side of order) {
                    const start = performance.now();
                    await connection.execute(queryCase[side], queryCase.params);
                    const duration = performance.now() - start;
                    if (iteration >= options.warmups) timings[side].push(duration);
                }
            }
            output.cases.push({
                name: queryCase.name,
                kind: queryCase.kind,
                resultParity: "pass",
                resultRows: afterRows.length,
                legacy: summary(timings.before),
                scoped: summary(timings.after),
                medianChangePercent: Number(
                    (
                        (summary(timings.after).medianMs / summary(timings.before).medianMs - 1) *
                        100
                    ).toFixed(2),
                ),
                explainAnalyze: {
                    legacy: planText(beforePlanRows),
                    scoped: planText(afterPlanRows),
                },
            });
        }

        const outputPath = options.out
            ? path.resolve(options.out)
            : path.join(
                  SERVER_ROOT,
                  "test-results",
                  "database-optimization",
                  `catalog-benchmark-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
              );
        await mkdir(path.dirname(outputPath), { recursive: true });
        await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
        process.stdout.write(
            `${JSON.stringify({ status: "pass", outputPath, schema: output.schema, databaseVersion: output.databaseVersion, dataset: output.dataset, cases: output.cases.map(({ name, kind, resultParity, legacy, scoped, medianChangePercent }) => ({ name, kind, resultParity, legacy, scoped, medianChangePercent })) }, null, 2)}\n`,
        );
    } finally {
        for (const table of ownedTables.reverse()) {
            try {
                await connection.query(`DROP TABLE IF EXISTS ${table}`);
            } catch {
                /* preserve the original benchmark error */
            }
        }
        cleanupComplete = true;
        await connection.end();
    }
    if (!cleanupComplete) throw new Error("Benchmark fixture cleanup did not complete.");
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
