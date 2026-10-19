import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";

const target = process.env.PUBLIC_ID_MIGRATION_TEST_URL;

describe.skipIf(!target)("integration: public resource ID migration", () => {
    it("backfills old rows, generates UUID v7 for legacy inserts, and enforces uniqueness and non-null", async () => {
        const url = new URL(target!);
        if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Migration test requires an explicit local MySQL target");
        const connection = await mysql.createConnection({
            host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password), multipleStatements: true,
        });
        const database = `public_ids_test_${randomBytes(8).toString("hex")}`;
        const tables = ["orders", "support_tickets", "after_sales_requests"];
        try {
            await connection.query(`CREATE DATABASE ${database}`);
            await connection.query(`USE ${database}`);
            for (const table of tables) {
                await connection.query(`CREATE TABLE ${table} (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, note VARCHAR(30))`);
                await connection.query(`INSERT INTO ${table} (note) VALUES ('historical'), ('historical')`);
            }
            const migration = readFileSync(resolve("src/database/prisma/migrations/20261019100000_public_resource_ids/migration.sql"), "utf8");
            await connection.query(migration);
            for (const table of tables) {
                await connection.query(`INSERT INTO ${table} (note) VALUES ('legacy insert'), ('legacy insert')`);
                const [rows] = await connection.query<RowDataPacket[]>(`SELECT id, public_id FROM ${table} ORDER BY id`);
                expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
                expect(new Set(rows.map((row) => row.public_id)).size).toBe(4);
                for (const row of rows) {
                    expect(row.public_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
                    expect(Math.abs(Date.now() - parseInt(row.public_id.replaceAll("-", "").slice(0, 12), 16))).toBeLessThan(60_000);
                }
                await expect(connection.query(`INSERT INTO ${table} (public_id) VALUES (?)`, [rows[0].public_id])).rejects.toMatchObject({ code: "ER_DUP_ENTRY" });
                await expect(connection.query(`INSERT INTO ${table} (public_id) VALUES (NULL)`)).rejects.toMatchObject({ code: "ER_BAD_NULL_ERROR" });
                await connection.query(`UPDATE ${table} SET note = 'updated' WHERE id = 1`);
                const [updated] = await connection.query<RowDataPacket[]>(`SELECT public_id FROM ${table} WHERE id = 1`);
                expect(updated[0].public_id).toBe(rows[0].public_id);
            }
        } finally {
            try { await connection.query(`DROP DATABASE IF EXISTS ${database}`); } finally { await connection.end(); }
        }
    }, 30_000);
});
