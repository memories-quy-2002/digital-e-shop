import { describe, expect, it, vi } from "vitest";
import { DeliveryStaffController } from "./delivery-staff.controller";

describe("DeliveryStaffController", () => {
    it("scopes assignment reads and status writes to the authenticated employee", async () => {
        const service = {
            listForStaff: vi.fn().mockResolvedValue([]),
            getForStaff: vi.fn().mockResolvedValue({ id: 7 }),
            transition: vi.fn().mockResolvedValue({ id: 7, status: "OUT_FOR_DELIVERY" }),
        };
        const controller = new DeliveryStaffController(service as never);
        const request = { user: { id: "driver-1" } } as never;

        await controller.list(request);
        await controller.detail("7", request);
        await controller.update("7", request, { status: "OUT_FOR_DELIVERY" });

        expect(service.listForStaff).toHaveBeenCalledWith("driver-1");
        expect(service.getForStaff).toHaveBeenCalledWith(7, "driver-1");
        expect(service.transition).toHaveBeenCalledWith({ assignmentId: 7, employeeId: "driver-1", status: "OUT_FOR_DELIVERY" });
    });
});
