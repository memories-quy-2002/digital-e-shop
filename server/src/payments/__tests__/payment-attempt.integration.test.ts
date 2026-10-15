import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PaymentAttemptRepository } from "../payment-attempt.repository";
import { PaymentAttemptService } from "../payment-attempt.service";

const databaseUrl = process.env.PAYMENT_ATTEMPT_TEST_DATABASE_URL;
const enabled = (() => {
    if (!databaseUrl) return false;
    const target = new URL(databaseUrl);
    const database = target.pathname.replace(/^\//, "");
    return ["localhost", "127.0.0.1"].includes(target.hostname)
        && target.port === "3307"
        && /(?:test|ci)/i.test(database);
})();
const integration = enabled ? describe : describe.skip;
let pool: Pool;
let connection: PoolConnection;
let pendingCheckoutId: number;
let attemptId: string;

const runInTransaction = async <T>(work: (tx: { query: <R = unknown>(sql: string, values?: unknown[]) => Promise<R> }) => Promise<T>): Promise<T> => {
    await connection.beginTransaction();
    try {
        const result = await work({ query: async <R>(sql: string, values: unknown[] = []) => {
            const [rows] = await connection.execute(sql, values);
            return rows as R;
        } });
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    }
};

integration("payment attempt MySQL integration", () => {
    const prefix = `ci_payos_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
    const service = new PaymentAttemptService(new PaymentAttemptRepository());

    beforeAll(async () => {
        pool = mysql.createPool(databaseUrl!);
        connection = await pool.getConnection();
        const [result] = await connection.execute<ResultSetHeader>(
            `INSERT INTO pending_checkouts
                (reservation_token, cart_json, total_price, discount, shipping_address, status, expires_at)
             VALUES (?, ?, ?, ?, ?, 'PENDING', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 35 MINUTE))`,
            [`${prefix}-reservation`, "[]", 250000, 0, "integration fixture"],
        );
        pendingCheckoutId = Number(result.insertId);
    });

    afterAll(async () => {
        if (connection && pendingCheckoutId) {
            await connection.execute("DELETE FROM payment_attempt_observations WHERE attempt_id = ?", [attemptId]);
            await connection.execute("DELETE FROM payment_attempt_refunds WHERE attempt_id = ?", [attemptId]);
            await connection.execute("DELETE FROM payment_attempts WHERE id = ?", [attemptId]);
            await connection.execute("DELETE FROM pending_checkouts WHERE id = ?", [pendingCheckoutId]);
            connection.release();
        }
        await pool?.end();
    });

    it("claims once, replays by owner/key, and appends deduplicated/conflicting receipt facts", async () => {
        const input = {
            owner: { kind: "authenticated" as const, userId: `${prefix}-owner` },
            idempotencyKey: randomUUID(),
            request: { cart: [{ productId: 5, quantity: 1 }] },
            snapshot: { items: [{ productId: 5, name: "Integration item", quantity: 1, unitPriceVnd: 250000 }], subtotalVnd: 250000, discountVnd: 0, shippingVnd: 0 },
            pendingCheckoutId,
            expectedAmountVnd: 250000,
            expiresAt: new Date(Date.now() + 35 * 60 * 1000),
        };
        const claim = await runInTransaction((tx) => service.claim(input, tx as never));
        attemptId = claim.id;
        expect(claim.providerOrderCode).toMatch(/^[1-9]\d*$/);
        await expect(runInTransaction((tx) => service.claim(input, tx as never))).resolves.toMatchObject({ id: claim.id, replayed: true });

        const observation = { attemptId, source: "WEBHOOK" as const, sourceKey: `${prefix}-event`, payload: { amount: 250000 },
            providerOrderCode: claim.providerOrderCode, providerLinkId: `${prefix}-link`, expectedAmountVnd: 250000, reportedAmountVnd: 250000, currency: "VND",
            paidAmountVnd: 250000, normalizedStatus: "PAID", verifiedAt: new Date(), verified: true };
        await expect(runInTransaction((tx) => service.recordObservation(observation, tx as never))).resolves.toMatchObject({ inserted: true, conflicting: false, paymentState: "PAID" });
        await expect(runInTransaction((tx) => service.recordObservation(observation, tx as never))).resolves.toMatchObject({ inserted: false, conflicting: false });
        await expect(runInTransaction((tx) => service.recordObservation({ ...observation, payload: { amount: 251000 } }, tx as never))).resolves.toMatchObject({ inserted: true, conflicting: true, paymentState: "PAID" });

        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS observations FROM payment_attempt_observations WHERE attempt_id = ?", [attemptId],
        );
        expect(Number(rows[0].observations)).toBe(2);
    });
});

if (!enabled) {
    describe.skip("payment attempt MySQL integration target", () => {
        it("requires PAYMENT_ATTEMPT_TEST_DATABASE_URL for an isolated localhost:3307 test/ci database", () => {});
    });
}
