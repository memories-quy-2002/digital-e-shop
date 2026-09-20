import { describe, expect, it, vi } from "vitest";
import { AfterSalesService } from "../after-sales.service";
import type { AfterSalesRepositoryPort } from "../after-sales.repository";

const order = {
    id: 42,
    orderStatus: 1,
    deliveredAt: "2026-09-18T00:00:00.000Z",
    currency: "VND",
};

const item = {
    id: 7,
    orderId: 42,
    quantity: 2,
    unitPrice: 120000,
    productName: "USB-C hub",
    warrantyMonths: 6,
};

const input = {
    orderId: 42,
    kind: "RETURN" as const,
    reason: "Arrived damaged",
    items: [{ orderItemId: 7, quantity: 1 }],
    idempotencyKey: "return-42-1",
};

function repository(): AfterSalesRepositoryPort {
    return {
        withTransaction: vi.fn(async (work) => work({} as never)),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        findOrderForIdentity: vi.fn().mockResolvedValue(order),
        findOrderItemsForUpdate: vi.fn().mockResolvedValue([item]),
        getActiveRequestedQuantities: vi.fn().mockResolvedValue(new Map()),
        insertRequest: vi.fn().mockResolvedValue({ id: 9, orderId: 42, status: "REQUESTED" }),
        listCustomerRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
        listGuestRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
        listAdminRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
        getCustomerRequest: vi.fn(),
        getGuestRequest: vi.fn(),
        getAdminRequest: vi.fn(),
        getAdminRequestForUpdate: vi.fn(),
        getRefundContextForUpdate: vi.fn(),
        confirmRefund: vi.fn(),
    };
}

describe("AfterSalesService", () => {
    it("creates a customer request only after ownership and item eligibility checks", async () => {
        const repo = repository();
        const service = new AfterSalesService(repo);

        await expect(service.createCustomerRequest("customer-1", input)).resolves.toMatchObject({ id: 9, status: "REQUESTED" });
        expect(repo.findOrderForIdentity).toHaveBeenCalledWith(expect.anything(), { orderId: 42, userId: "customer-1" });
        expect(repo.insertRequest).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ userId: "customer-1" }), input, [item]);
    });

    it("returns the idempotent existing request without inserting twice", async () => {
        const repo = repository();
        vi.mocked(repo.findByIdempotencyKey).mockResolvedValue({ id: 11, orderId: 42, userId: "customer-1", status: "REQUESTED" } as never);
        const service = new AfterSalesService(repo);

        await expect(service.createCustomerRequest("customer-1", input)).resolves.toMatchObject({ id: 11 });
        expect(repo.insertRequest).not.toHaveBeenCalled();
    });

    it("rejects an over-requested quantity with a meaningful conflict", async () => {
        const repo = repository();
        vi.mocked(repo.getActiveRequestedQuantities).mockResolvedValue(new Map([[7, 2]]));
        const service = new AfterSalesService(repo);

        await expect(service.createCustomerRequest("customer-1", input)).rejects.toMatchObject({
            statusCode: 409,
            message: "The requested quantity is no longer available for after-sales processing.",
        });
    });

    it("requires the guest token to resolve the guest order identity", async () => {
        const repo = repository();
        const service = new AfterSalesService(repo);

        await expect(service.createGuestRequest({ ...input, guestOrderToken: "guest-secret" })).resolves.toMatchObject({ id: 9 });
        expect(repo.findOrderForIdentity).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orderId: 42, guestOrderTokenHash: expect.any(String) }));
    });

    it("does not replay a guest idempotency key for a different guest token", async () => {
        const repo = repository();
        vi.mocked(repo.findByIdempotencyKey).mockResolvedValue({ id: 11, orderId: 42, userId: null, guestOrderTokenHash: "different-hash", status: "REQUESTED" } as never);
        const service = new AfterSalesService(repo);

        await expect(service.createGuestRequest({ ...input, guestOrderToken: "guest-secret" })).rejects.toMatchObject({
            statusCode: 409,
            code: "IDEMPOTENCY_CONFLICT",
        });
    });
});
