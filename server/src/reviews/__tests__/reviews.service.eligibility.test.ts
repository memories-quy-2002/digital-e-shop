import { describe, expect, it, vi } from "vitest";
import { NestReviewsService } from "../reviews.service";

type Callback = (error: Error | null, rows?: unknown) => void;

describe("review purchase eligibility", () => {
    const repository = {
        hasCompletedPurchase: vi.fn(),
        getReviewByUserAndProduct: vi.fn(),
        getRatingSummary: vi.fn(),
        addReviewByUserId: vi.fn(),
        updateReviewByUserAndProduct: vi.fn(),
    };

    it.each([0, 2])("rejects review for order status %s", async () => {
        repository.hasCompletedPurchase.mockResolvedValue(false);
        const service = new NestReviewsService(repository as never);

        await expect(service.addReview("u1", 10, 5, "text")).rejects.toThrow("completed order");
    });

    it("allows review after a Done order", async () => {
        repository.hasCompletedPurchase.mockResolvedValue(true);
        repository.getReviewByUserAndProduct.mockImplementation((_u: string, _p: number, callback: Callback) => callback(null, []));
        repository.addReviewByUserId.mockImplementation((_u: string, _p: number, _r: number, _c: string, callback: Callback) => callback(null));
        repository.getRatingSummary.mockImplementation((_p: number, callback: Callback) => callback(null, [{ total: 1, average: 5, five: 1 }]));
        const service = new NestReviewsService(repository as never);

        await expect(service.addReview("u1", 10, 5, "text")).resolves.toMatchObject({ msg: expect.any(String) });
    });
});
