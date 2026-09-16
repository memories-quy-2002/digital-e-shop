import "reflect-metadata";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../payment-reconciliation.service", () => ({ PaymentReconciliationService: class {} }));

import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AdminPaymentsController } from "../admin-payments.controller";
import { RolesGuard, ROLES_KEY } from "../../guards/roles.guard";
import { AuthGuard } from "../../guards/auth.guard";

type ReconciliationServiceMock = {
    listCandidates: ReturnType<typeof vi.fn>;
    runReconciliation: ReturnType<typeof vi.fn>;
    reconcilePayment: ReturnType<typeof vi.fn>;
    confirmCod: ReturnType<typeof vi.fn>;
    listWebhookEvents: ReturnType<typeof vi.fn>;
};

const adminRequest = { user: { id: "admin-1", role: "admin" }, requestId: "request-7" } as never;

const buildController = () => {
    const service: ReconciliationServiceMock = {
        listCandidates: vi.fn(),
        runReconciliation: vi.fn(),
        reconcilePayment: vi.fn(),
        confirmCod: vi.fn(),
        listWebhookEvents: vi.fn(),
    };
    return { controller: new AdminPaymentsController(service as never), service };
};

describe("AdminPaymentsController", () => {
    beforeEach(() => vi.clearAllMocks());

    it("clamps a reconciliation run to one hundred candidates", async () => {
        const { controller, service } = buildController();
        service.runReconciliation.mockResolvedValue({ results: [] });

        await controller.runReconciliation({ limit: 999 }, adminRequest);

        expect(service.runReconciliation).toHaveBeenCalledWith({ limit: 100, requestedBy: "admin-1" });
    });

    it("returns route-local admin payment data with the request correlation id", async () => {
        const { controller, service } = buildController();
        service.listCandidates.mockResolvedValue({
            candidates: [],
            pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
        });

        await expect(controller.listReconciliation({ page: 1, limit: 50 }, adminRequest))
            .resolves.toMatchObject({
                candidates: [],
                msg: "Payment reconciliation candidates retrieved successfully",
                requestId: "request-7",
            });
        expect(service.listCandidates).toHaveBeenCalledWith({ page: 1, limit: 50 },);
    });

    it("passes the authenticated admin to a single-payment reconciliation", async () => {
        const { controller, service } = buildController();
        service.reconcilePayment.mockResolvedValue({ outcome: "MATCHED", paymentId: 42 });

        await controller.reconcilePayment("42", adminRequest);

        expect(service.reconcilePayment).toHaveBeenCalledWith(42, "admin-1");
    });

    it("passes only the trimmed operator note to COD confirmation", async () => {
        const { controller, service } = buildController();
        service.confirmCod.mockResolvedValue({ id: 42, status: "paid" });

        await controller.confirmCod("42", { note: "  collected at front desk  " }, adminRequest);

        expect(service.confirmCod).toHaveBeenCalledWith(42, { note: "collected at front desk" }, "admin-1");
    });

    it("returns webhook history with the local response message", async () => {
        const { controller, service } = buildController();
        service.listWebhookEvents.mockResolvedValue([{ id: 7, status: "PROCESSED" }]);

        await expect(controller.getWebhookEvents("42", adminRequest)).resolves.toMatchObject({
            events: [{ id: 7, status: "PROCESSED" }],
            msg: "Payment webhook events retrieved successfully",
            requestId: "request-7",
        });
        expect(service.listWebhookEvents).toHaveBeenCalledWith(42);
    });

    it.each([
        "listReconciliation",
        "runReconciliation",
        "reconcilePayment",
        "confirmCod",
        "getWebhookEvents",
    ])("guards %s with authentication, admin role, and the roles guard", (method) => {
        const descriptor = Object.getOwnPropertyDescriptor(AdminPaymentsController.prototype, method);
        expect(descriptor).toBeDefined();
        expect(Reflect.getMetadata(GUARDS_METADATA, descriptor!.value)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, descriptor!.value)).toEqual(["admin"]);
    });
});
