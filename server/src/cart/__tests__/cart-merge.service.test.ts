import { describe, expect, it } from "vitest";
import { CartMergeService } from "../cart-merge.service";

const setup = () => {
    const operations = new Map<string, { payloadHash: string; result: unknown }>();
    const cart = new Map<number, number>();
    const stock = new Map([[10, 5], [11, 0]]);
    let connection = Promise.resolve();
    let writes = 0;
    const repository = {
        withTransaction: async <T>(work: (tx: object) => Promise<T>) => {
            let release!: () => void;
            const next = new Promise<void>((resolve) => { release = resolve; });
            const previous = connection;
            connection = previous.then(() => next);
            await previous;
            try { return await work({}); } finally { release(); }
        },
        lockUser: async () => undefined,
        findOperation: async (_tx: object, userId: string, operationId: string) => {
            const operation = operations.get(`${userId}:${operationId}`);
            return operation ? { payloadHash: operation.payloadHash, resultJson: operation.result as never } : null;
        },
        createOperation: async (_tx: object, userId: string, operationId: string, payloadHash: string) => {
            operations.set(`${userId}:${operationId}`, { payloadHash, result: { accepted: [], rejected: [] } });
        },
        getOrCreateCart: async () => 1,
        getProductAvailability: async (_tx: object, productId: number) => stock.has(productId)
            ? { availableStock: stock.get(productId)! }
            : null,
        getCartQuantity: async (_tx: object, _cartId: number, productId: number) => cart.get(productId) || 0,
        addItems: async (_tx: object, _cartId: number, productId: number, quantity: number) => {
            writes += 1;
            cart.set(productId, (cart.get(productId) || 0) + quantity);
        },
        completeOperation: async (_tx: object, userId: string, operationId: string, result: unknown) => {
            const operation = operations.get(`${userId}:${operationId}`)!;
            operation.result = result;
        },
    };
    return { service: new CartMergeService(repository as never), operations, cart, getWrites: () => writes };
};

describe("CartMergeService", () => {
    it("replays one stored result for the same operation and snapshot", async () => {
        const { service, cart, getWrites } = setup();
        const input = { operationId: "123e4567-e89b-42d3-a456-426614174000", items: [{ productId: 10, quantity: 2 }] };

        const first = await service.merge("user-1", input);
        const replay = await service.merge("user-1", input);

        expect(first).toEqual({ accepted: [{ productId: 10, quantity: 2 }], rejected: [] });
        expect(replay).toEqual(first);
        expect(cart.get(10)).toBe(2);
        expect(getWrites()).toBe(1);
    });

    it("rejects a reused operation ID with a different snapshot", async () => {
        const { service } = setup();
        const operationId = "123e4567-e89b-42d3-a456-426614174000";
        await service.merge("user-1", { operationId, items: [{ productId: 10, quantity: 1 }] });

        await expect(service.merge("user-1", { operationId, items: [{ productId: 10, quantity: 2 }] }))
            .rejects.toMatchObject({ code: "CART_MERGE_IDEMPOTENCY_CONFLICT" });
    });

    it("commits accepted items and a partial result in the same operation", async () => {
        const { service, cart } = setup();
        const result = await service.merge("user-1", {
            operationId: "123e4567-e89b-42d3-a456-426614174000",
            items: [{ productId: 10, quantity: 2 }, { productId: 11, quantity: 1 }, { productId: 99, quantity: 1 }],
        });

        expect(result).toEqual({
            accepted: [{ productId: 10, quantity: 2 }],
            rejected: [
                { productId: 11, quantity: 1, reason: "insufficient_stock" },
                { productId: 99, quantity: 1, reason: "unavailable" },
            ],
        });
        expect(cart.get(10)).toBe(2);
    });

    it("serializes simultaneous retries for the same user and operation", async () => {
        const { service, cart, getWrites } = setup();
        const input = { operationId: "123e4567-e89b-42d3-a456-426614174000", items: [{ productId: 10, quantity: 2 }] };

        const results = await Promise.all([service.merge("user-1", input), service.merge("user-1", input)]);

        expect(results[0]).toEqual(results[1]);
        expect(cart.get(10)).toBe(2);
        expect(getWrites()).toBe(1);
    });
});
