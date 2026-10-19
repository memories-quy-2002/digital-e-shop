import { describe, expect, it, vi } from "vitest";
import { GuestOrderAccessRecoveryRepository } from "../guest-order-access-recovery.repository";

describe("GuestOrderAccessRecoveryRepository", () => {
    it("rotates order, PayOS pending-checkout, and guest after-sales hashes in one transaction context", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 })
            .mockResolvedValueOnce({ affectedRows: 1 });
        const repository = new GuestOrderAccessRecoveryRepository();

        await expect(repository.rotateOrderToken({ query } as never, {
            orderId: 42,
            email: "buyer@example.test",
            tokenHash: "a".repeat(64),
        })).resolves.toBe(true);

        expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("UPDATE orders SET guest_order_token_hash"), ["a".repeat(64), 42, "buyer@example.test"]);
        expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE pending_checkouts pc"), [42, "a".repeat(64)]);
        expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining("UPDATE after_sales_requests SET guest_order_token_hash"), ["a".repeat(64), 42]);
    });

    it("does not rotate dependent capability hashes when the guest order no longer matches", async () => {
        const query = vi.fn().mockResolvedValueOnce({ affectedRows: 0 });
        const repository = new GuestOrderAccessRecoveryRepository();

        await expect(repository.rotateOrderToken({ query } as never, {
            orderId: 42,
            email: "buyer@example.test",
            tokenHash: "a".repeat(64),
        })).resolves.toBe(false);
        expect(query).toHaveBeenCalledTimes(1);
    });
});
