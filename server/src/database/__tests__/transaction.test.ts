import { beforeEach, describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => ({
    pool: { getConnection: vi.fn() },
}));

vi.mock("#src/config/database.config", () => ({ default: pool }));

import { withRetryableTransaction, withTransaction } from "../transaction";

const buildConnection = () => ({
    query: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
});

describe("withTransaction", () => {
    beforeEach(() => vi.clearAllMocks());

    it("commits work and releases the connection", async () => {
        const connection = buildConnection();
        pool.getConnection.mockImplementation((callback) => callback(null, connection));
        connection.beginTransaction.mockImplementation((callback) => callback());
        connection.commit.mockImplementation((callback) => callback());
        connection.query.mockImplementation((_sql, _values, callback) => callback(null, [{ value: 1 }]));

        await expect(withTransaction(async (tx) => {
            const rows = await tx.query<Array<{ value: number }>>("SELECT 1");
            return rows[0].value;
        })).resolves.toBe(1);

        expect(connection.beginTransaction).toHaveBeenCalledOnce();
        expect(connection.commit).toHaveBeenCalledOnce();
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledOnce();
        expect(connection.query.mock.calls[0][0]).toEqual({ sql: "SELECT 1", timeout: 8000 });
    });

    it("rolls back and releases when work fails", async () => {
        const connection = buildConnection();
        pool.getConnection.mockImplementation((callback) => callback(null, connection));
        connection.beginTransaction.mockImplementation((callback) => callback());
        connection.rollback.mockImplementation((callback) => callback());

        await expect(withTransaction(async () => {
            throw new Error("work failed");
        })).rejects.toThrow("work failed");

        expect(connection.rollback).toHaveBeenCalledOnce();
        expect(connection.commit).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledOnce();
    });
});


describe("withRetryableTransaction", () => {
    beforeEach(() => vi.clearAllMocks());

    const setupConnections = (connections: ReturnType<typeof buildConnection>[]) => {
        let index = 0;
        pool.getConnection.mockImplementation((callback) => callback(null, connections[index++]));
        for (const connection of connections) {
            connection.beginTransaction.mockImplementation((callback) => callback());
            connection.rollback.mockImplementation((callback) => callback());
            connection.commit.mockImplementation((callback) => callback());
        }
    };

    it("replays database-only work on a deadlock using a fresh connection", async () => {
        const first = buildConnection();
        const second = buildConnection();
        setupConnections([first, second]);
        first.query.mockImplementation((_sql, _values, callback) =>
            callback(Object.assign(new Error("deadlock"), { code: "ER_LOCK_DEADLOCK", errno: 1213 })));
        second.query.mockImplementation((_sql, _values, callback) => callback(null, [{ value: 7 }]));
        const work = vi.fn(async (tx: Parameters<typeof withTransaction>[0] extends (tx: infer C) => Promise<unknown> ? C : never) => {
            const rows = await tx.query<Array<{ value: number }>>("SELECT 7");
            return rows[0].value;
        });

        await expect(withRetryableTransaction(work, { baseDelayMs: 0 })).resolves.toBe(7);

        expect(work).toHaveBeenCalledTimes(2);
        expect(first.rollback).toHaveBeenCalledOnce();
        expect(first.release).toHaveBeenCalledOnce();
        expect(second.commit).toHaveBeenCalledOnce();
        expect(second.release).toHaveBeenCalledOnce();
    });

    it("retries a lock wait timeout only up to the configured attempt limit", async () => {
        const first = buildConnection();
        const second = buildConnection();
        setupConnections([first, second]);
        for (const connection of [first, second]) {
            connection.query.mockImplementation((_sql, _values, callback) =>
                callback(Object.assign(new Error("lock wait timeout"), { code: "ER_LOCK_WAIT_TIMEOUT", errno: 1205 })));
        }
        const work = vi.fn(async (tx: Parameters<typeof withTransaction>[0] extends (tx: infer C) => Promise<unknown> ? C : never) => tx.query("UPDATE products SET stock = stock + 1"));

        await expect(withRetryableTransaction(work, { maxAttempts: 2, baseDelayMs: 0 }))
            .rejects.toThrow("lock wait timeout");

        expect(work).toHaveBeenCalledTimes(2);
        expect(first.rollback).toHaveBeenCalledOnce();
        expect(second.rollback).toHaveBeenCalledOnce();
    });

    it("never retries an ambiguous COMMIT failure", async () => {
        const first = buildConnection();
        setupConnections([first]);
        first.commit.mockImplementation((callback) =>
            callback(Object.assign(new Error("commit failed"), { code: "ER_LOCK_DEADLOCK", errno: 1213 })));
        const work = vi.fn(async () => 1);

        await expect(withRetryableTransaction(work, { baseDelayMs: 0 })).rejects.toThrow("commit failed");

        expect(work).toHaveBeenCalledOnce();
        expect(pool.getConnection).toHaveBeenCalledOnce();
        expect(first.release).toHaveBeenCalledOnce();
    });

    it("does not retry business logic errors", async () => {
        const first = buildConnection();
        setupConnections([first]);
        const work = vi.fn(async () => { throw new Error("invalid cart"); });

        await expect(withRetryableTransaction(work, { baseDelayMs: 0 })).rejects.toThrow("invalid cart");
        expect(work).toHaveBeenCalledOnce();
        expect(first.rollback).toHaveBeenCalledOnce();
    });

    it("rejects invalid retry configuration before opening a connection", async () => {
        await expect(withRetryableTransaction(async () => 1, { maxAttempts: 0 })).rejects.toThrow(RangeError);
        await expect(withRetryableTransaction(async () => 1, { baseDelayMs: -1 })).rejects.toThrow(RangeError);
        expect(pool.getConnection).not.toHaveBeenCalled();
    });
});
