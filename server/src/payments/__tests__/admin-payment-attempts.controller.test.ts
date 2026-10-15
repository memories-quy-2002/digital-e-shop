import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "../../guards/auth.guard";
import { RolesGuard, ROLES_KEY } from "../../guards/roles.guard";
import { AdminPaymentAttemptsController } from "../admin-payment-attempts.controller";

describe("AdminPaymentAttemptsController", () => {
    it("guards the entire paid-exception API with admin authentication before service access", () => {
        expect(Reflect.getMetadata(GUARDS_METADATA, AdminPaymentAttemptsController)).toEqual([AuthGuard, RolesGuard]);
        expect(Reflect.getMetadata(ROLES_KEY, AdminPaymentAttemptsController)).toEqual(["admin"]);
    });

    it("returns the bounded queue with the existing success envelope", async () => {
        const service = { listExceptions: vi.fn().mockResolvedValue({ items: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) };
        const controller = new AdminPaymentAttemptsController(service as never);

        await expect(controller.list({}, { requestId: "request-1" } as never)).resolves.toMatchObject({
            items: [], pagination: { page: 1, limit: 25 }, msg: "Paid payment exceptions retrieved successfully", requestId: "request-1",
        });
        expect(service.listExceptions).toHaveBeenCalledWith({});
    });
});
