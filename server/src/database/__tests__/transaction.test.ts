import { beforeEach, describe, expect, it, vi } from "vitest";

const { pool } = vi.hoisted(() => ({
    pool: { getConnection: vi.fn() },
}));

vi.mock("#src/config/database.config", () => ({ default: pool }));

import { withTransaction } from "../transaction";

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
