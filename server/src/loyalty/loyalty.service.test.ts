import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LoyaltyRepository } from "./loyalty.repository";
import { LoyaltyService } from "./loyalty.service";

const mocks = vi.hoisted(() => ({ txQuery: vi.fn() }));

vi.mock("../database/transaction", () => ({
    withTransaction: (callback: (tx: { query: typeof mocks.txQuery }) => unknown) => callback({ query: mocks.txQuery }),
}));
vi.mock("./loyalty.repository", () => ({ LoyaltyRepository: class LoyaltyRepository {} }));

const reward = {
    id: 7,
    description: "Member voucher",
    discount_percent: 15,
    min_order_value: 100_000,
    loyalty_points_cost: 250,
    starts_at: null,
    expires_at: null,
    remaining_uses: 4,
};

const createRepository = () => ({
    getRewardForAccount: vi.fn().mockResolvedValue(reward),
    getBalanceForUpdate: vi.fn().mockResolvedValue(900),
    createVoucher: vi.fn().mockResolvedValue(31),
    applyDelta: vi.fn().mockResolvedValue(true),
});

describe("LoyaltyService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("atomically claims a promotion reward and records the point debit", async () => {
        const repository = createRepository();
        const service = new LoyaltyService(repository as unknown as LoyaltyRepository);

        const result = await service.claimReward("customer-1", 7);

        expect(repository.createVoucher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            userId: "customer-1",
            promotionId: 7,
            pointsCost: 250,
        }));
        expect(repository.applyDelta).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
            userId: "customer-1",
            pointsDelta: -250,
            entryType: "VOUCHER_REDEEM",
            eventKey: "voucher:31:claim",
            voucherId: 31,
        }));
        expect(result.balancePoints).toBe(650);
        expect(result.voucher.code).toMatch(/^LOY-[A-F0-9]{20}$/);
    });

    it("does not issue a reward when the account has insufficient points", async () => {
        const repository = createRepository();
        repository.getBalanceForUpdate.mockResolvedValue(10);
        const service = new LoyaltyService(repository as unknown as LoyaltyRepository);

        await expect(service.claimReward("customer-1", 7)).rejects.toThrow("You do not have enough loyalty points");
        expect(repository.createVoucher).not.toHaveBeenCalled();
        expect(repository.applyDelta).not.toHaveBeenCalled();
    });

    it("awards points from net merchandise only after a verified real payment", async () => {
        const repository = createRepository();
        const service = new LoyaltyService(repository as unknown as LoyaltyRepository);
        const order = {
            user_id: "customer-1",
            payment_provider: "payos",
            payment_status: "paid",
            simulated: 0,
            pricing_snapshot: JSON.stringify({ itemsSubtotal: 12_999, promotionDiscount: 1_000, loyaltyDiscount: 2_000 }),
            total_price: 15_000,
            discount: 3_000,
            loyalty_discount: 2_000,
        };
        const tx = { query: vi.fn().mockResolvedValue([order]) };

        await expect(service.awardPaidOrder(tx as never, 44)).resolves.toBe(9);
        expect(repository.applyDelta).toHaveBeenCalledWith(tx, expect.objectContaining({
            userId: "customer-1",
            pointsDelta: 9,
            entryType: "ORDER_EARN",
            eventKey: "order:44:earn",
            amountVnd: 9_999,
            orderId: 44,
        }));
    });

    it.each([
        { payment_provider: "payos", payment_status: "pending", simulated: 0 },
        { payment_provider: "cash", payment_status: "paid", simulated: 1 },
    ])("does not award points for unconfirmed or simulated payments", async (payment) => {
        const repository = createRepository();
        const service = new LoyaltyService(repository as unknown as LoyaltyRepository);
        const tx = { query: vi.fn().mockResolvedValue([{
            user_id: "customer-1",
            ...payment,
            pricing_snapshot: JSON.stringify({ itemsSubtotal: 50_000, promotionDiscount: 0 }),
            total_price: 50_000,
            discount: 0,
            loyalty_discount: 0,
        }]) };

        await expect(service.awardPaidOrder(tx as never, 45)).resolves.toBe(0);
        expect(repository.applyDelta).not.toHaveBeenCalled();
    });
});
