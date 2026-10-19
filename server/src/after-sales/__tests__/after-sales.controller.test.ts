import { describe, expect, it, vi } from "vitest";
import { HttpException } from "@nestjs/common";
import { AfterSalesController } from "../after-sales.controller";
import { AfterSalesGuestController } from "../after-sales-guest.controller";
import { AdminAfterSalesController } from "../admin-after-sales.controller";

const request = (role: string, id = "user-1") => ({ user: { id, role } }) as never;

describe("after-sales controllers", () => {
    it("binds the authenticated customer identity to create/list/detail calls", async () => {
        const service = {
            createCustomerRequest: vi.fn().mockResolvedValue({ id: 1 }),
            listCustomerRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
            getCustomerRequest: vi.fn().mockResolvedValue({ id: 1 }),
        };
        const controller = new AfterSalesController(service as never);
        const body = { orderId: 9, kind: "RETURN", reason: "damaged", items: [{ orderItemId: 4, quantity: 1 }], idempotencyKey: "k-1" };
        const query = { page: 1, limit: 50 };

        await expect(controller.create(request("customer"), body as never)).resolves.toEqual({ request: { id: 1 }, msg: "After-sales request created successfully" });
        await expect(controller.list(request("customer"), query)).resolves.toHaveProperty("requests");
        await expect(controller.detail("1", request("customer"))).resolves.toEqual({ request: { id: 1 }, msg: "After-sales request retrieved successfully" });
        expect(service.createCustomerRequest).toHaveBeenCalledWith("user-1", body);
        expect(service.listCustomerRequests).toHaveBeenCalledWith("user-1", query);
        expect(service.getCustomerRequest).toHaveBeenCalledWith("user-1", 1);
    });

    it("maps guest capability routes to body-token service calls", async () => {
        const service = {
            createGuestRequest: vi.fn().mockResolvedValue({ id: 2 }),
            listGuestRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
            getGuestRequest: vi.fn().mockResolvedValue({ id: 2 }),
        };
        const controller = new AfterSalesGuestController(service as never);
        const body = { orderId: 9, guestOrderToken: "secret", kind: "RETURN", reason: "damaged", items: [{ orderItemId: 4, quantity: 1 }], idempotencyKey: "k-2" };
        const lookup = { orderId: 9, guestOrderToken: "secret", page: 1, limit: 50 };

        await expect(controller.create(body as never)).resolves.toHaveProperty("request.id", 2);
        await expect(controller.list(lookup as never)).resolves.toHaveProperty("requests");
        await expect(controller.detail("2", { orderId: 9, guestOrderToken: "secret" } as never)).resolves.toHaveProperty("request.id", 2);
        expect(service.listGuestRequests).toHaveBeenCalledWith(9, "secret", expect.objectContaining({ page: 1, limit: 50 }));
        expect(service.getGuestRequest).toHaveBeenCalledWith(9, "secret", 2);
    });

    it("keeps admin transitions protected and retires the unsafe legacy refund route", async () => {
        const service = {
            listAdminRequests: vi.fn().mockResolvedValue({ requests: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } }),
            getAdminRequest: vi.fn().mockResolvedValue({ id: 3 }),
            transitionRequest: vi.fn().mockResolvedValue({ id: 3, status: "APPROVED" }),
            confirmRefund: vi.fn().mockResolvedValue({ id: 3, status: "REFUNDED" }),
        };
        const controller = new AdminAfterSalesController(service as never, { confirm: vi.fn() } as never);

        await expect(controller.list({ page: 1, limit: 50 })).resolves.toHaveProperty("requests");
        await expect(controller.detail("3")).resolves.toHaveProperty("request.id", 3);
        await expect(controller.transition("3", request("admin", "admin-1"), { status: "APPROVED" })).resolves.toHaveProperty("request.status", "APPROVED");
        await expect(controller.refund()).rejects.toMatchObject({ status: 410 });
        expect(service.transitionRequest).toHaveBeenCalledWith(3, "admin-1", { status: "APPROVED" });
        expect(service.confirmRefund).not.toHaveBeenCalled();
    });

    it("preserves domain status codes in HTTP errors", async () => {
        const service = { getAdminRequest: vi.fn().mockRejectedValue(Object.assign(new Error("not found"), { statusCode: 404 })) };
        const controller = new AdminAfterSalesController(service as never);

        await expect(controller.detail("99")).rejects.toBeInstanceOf(HttpException);
        await expect(controller.detail("99")).rejects.toMatchObject({ status: 404 });
    });

    it("accepts UUID v7 request references on customer, guest, and admin detail routes", async () => {
        const publicId = "019a2b3c-4d5e-7f80-8123-456789abcdef";
        const customerService = { getCustomerRequest: vi.fn().mockResolvedValue({ id: 1, publicId }) };
        await expect(new AfterSalesController(customerService as never).detail(publicId, request("customer"))).resolves.toHaveProperty("request.publicId", publicId);
        expect(customerService.getCustomerRequest).toHaveBeenCalledWith("user-1", publicId);

        const guestService = { getGuestRequest: vi.fn().mockResolvedValue({ id: 2, publicId }) };
        await expect(new AfterSalesGuestController(guestService as never).detail(publicId, { orderId: 9, guestOrderToken: "secret" } as never)).resolves.toHaveProperty("request.publicId", publicId);
        expect(guestService.getGuestRequest).toHaveBeenCalledWith(9, "secret", publicId);

        const adminService = { getAdminRequest: vi.fn().mockResolvedValue({ id: 3, publicId }) };
        await expect(new AdminAfterSalesController(adminService as never).detail(publicId)).resolves.toHaveProperty("request.publicId", publicId);
        expect(adminService.getAdminRequest).toHaveBeenCalledWith(publicId);
    });

    it("rejects an unsupported UUID version before calling the request service", async () => {
        const service = { getAdminRequest: vi.fn() };
        const controller = new AdminAfterSalesController(service as never);

        await expect(controller.detail("019a2b3c-4d5e-4f80-8123-456789abcdef"))
            .rejects.toMatchObject({ status: 400 });
        expect(service.getAdminRequest).not.toHaveBeenCalled();
    });
});
