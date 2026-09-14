import { describe, expect, it, vi } from "vitest";
import { CartItemNotFoundError, NestCartService } from "../cart.service";

describe("cart ownership failures", () => {
    it("returns a 404 when deleting a cart item outside the customer's active cart", async () => {
        const repository = {
            deleteCartItem: vi.fn((_cartItemId: number, _uid: string, callback: (error: null, result: { affectedRows: number }) => void) => {
                callback(null, { affectedRows: 0 });
            }),
        };
        const service = new NestCartService(repository as never, {} as never, {} as never, {} as never);

        await expect(service.deleteCartItem(7, "customer-1")).rejects.toMatchObject({
            name: CartItemNotFoundError.name,
            statusCode: 404,
        });
    });
});
