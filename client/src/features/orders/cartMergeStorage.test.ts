import { beforeEach, describe, expect, it } from "vitest";
import { clearCartMergeOperation, getOrCreateCartMergeOperation, readCartMergeOperation } from "./cartMergeStorage";

describe("cart merge operation storage", () => {
    beforeEach(() => localStorage.clear());

    it("reuses the operation ID and immutable snapshot until the server confirms it", () => {
        const items = [{ productId: 10, quantity: 2 }];
        const first = getOrCreateCartMergeOperation(items);
        const retry = getOrCreateCartMergeOperation([{ ...items[0] }]);

        expect(retry).toEqual(first);
        expect(readCartMergeOperation()).toEqual(first);
        expect(first.operationId).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it("keeps a pending snapshot stable even if the visible guest cart changes", () => {
        const operation = getOrCreateCartMergeOperation([{ productId: 10, quantity: 2 }]);

        expect(getOrCreateCartMergeOperation([{ productId: 10, quantity: 3 }])).toEqual(operation);
    });

    it("creates a new operation after a confirmed result is cleared", () => {
        const first = getOrCreateCartMergeOperation([{ productId: 10, quantity: 1 }]);
        clearCartMergeOperation();
        const next = getOrCreateCartMergeOperation([{ productId: 11, quantity: 1 }]);

        expect(next.operationId).not.toBe(first.operationId);
        expect(next.items).toEqual([{ productId: 11, quantity: 1 }]);
    });
});
