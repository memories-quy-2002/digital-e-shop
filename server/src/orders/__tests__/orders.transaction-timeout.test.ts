import { afterEach, describe, expect, it, vi } from "vitest";

const dbState = vi.hoisted(() => ({
    connection: null as unknown,
}));

vi.mock("#src/config/database.config", () => ({
    default: {
        getConnection(callback: (err: Error | null, connection: unknown) => void) {
            callback(null, dbState.connection);
        },
    },
}));

vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import { NestOrdersService } from "../orders.service";

afterEach(() => {
    vi.useRealTimers();
});

describe("createOrderFromValidatedCart transaction completion", () => {
    it("does not reject independently while the database transaction can still commit", async () => {
        vi.useFakeTimers();

        const release = vi.fn();
        dbState.connection = {
            query(options: { sql: string }, _values: unknown, callback: (err: Error | null, result?: unknown) => void) {
                if (options.sql.startsWith("INSERT INTO orders")) {
                    callback(null, { insertId: 42 });
                    return;
                }
                if (options.sql.startsWith("SELECT id")) {
                    callback(null, [{ id: 42, date_added: "2026-08-24T00:00:00.000Z" }]);
                    return;
                }
                callback(null, { affectedRows: 1 });
            },
            beginTransaction(callback: (err?: Error | null) => void) {
                callback(null);
            },
            commit(callback: (err?: Error | null) => void) {
                setTimeout(() => callback(null), 9000);
            },
            rollback(callback: (err?: Error | null) => void) {
                callback(null);
            },
            release,
        };

        const service = new NestOrdersService(
            {} as never,
            { recordTimelineEvent: vi.fn() } as never,
            {} as never,
            { recordMovements: vi.fn() } as never,
            { notifyOrderPlaced: vi.fn() } as never,
        );

        let outcome: "pending" | "resolved" | "rejected" = "pending";
        const operation = service
            .createOrderFromValidatedCart({
                uid: "customer-1",
                authoritativeCart: [],
                authoritativeTotalPrice: 25,
                discount: 0,
                shippingAddress: "123 Main St",
                paymentMethod: "cash",
            })
            .then(
                () => {
                    outcome = "resolved";
                },
                () => {
                    outcome = "rejected";
                },
            );

        await vi.advanceTimersByTimeAsync(8001);
        expect(outcome).toBe("pending");

        await vi.advanceTimersByTimeAsync(1000);
        await operation;
        expect(outcome).toBe("resolved");
        expect(release).toHaveBeenCalledTimes(1);
    });
});
