import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryAssignmentService } from "./delivery-assignment.service";
import type { DeliveryAssignment, DeliveryAssignmentRepository } from "./delivery-assignment.repository";

vi.mock("../orders/order-delivery", () => ({ completeDeliveredOrder: vi.fn(async () => true) }));

const assignment = (overrides: Partial<DeliveryAssignment> = {}): DeliveryAssignment => ({
    id: 7,
    orderId: 42,
    employeeId: "driver-1",
    employeeName: "Driver One",
    scheduledStartAt: "2026-10-17T02:00:00.000Z",
    scheduledEndAt: "2026-10-17T03:00:00.000Z",
    status: "ASSIGNED",
    failureReason: null,
    events: [],
    ...overrides,
});

describe("DeliveryAssignmentService", () => {
    let repository: DeliveryAssignmentRepository;
    let service: DeliveryAssignmentService;
    let current: DeliveryAssignment;

    beforeEach(() => {
        current = assignment();
        repository = {
            transaction: vi.fn((work) => work({} as never)),
            lockEmployee: vi.fn(async () => ({ id: "driver-1", role: "DeliveryStaff", status: "Active", name: "Driver One" })),
            lockEligibleOrder: vi.fn(async () => ({ id: 42, status: 0, currency: "VND", deliverySnapshot: { provider: "INTERNAL" }, shipmentState: "READY_TO_SHIP", shipmentProvider: "INTERNAL", paymentProvider: "cash", paymentStatus: "pending", simulated: false, codAmountVnd: 100000 })),
            lockOrder: vi.fn(async () => undefined),
            findOrderIdForStaff: vi.fn(async (_tx, id, employeeId) => id === 7 && employeeId === "driver-1" ? 42 : null),
            findActiveAssignmentsForOrder: vi.fn(async () => []),
            findScheduleConflict: vi.fn(async () => null),
            nextAttemptNumber: vi.fn(async () => 1),
            markReassigned: vi.fn(async () => undefined),
            createAssignment: vi.fn(async () => current),
            appendEvent: vi.fn(async () => undefined),
            lockAssignmentForStaff: vi.fn(async (_tx, id, employeeId) => id === 7 && employeeId === "driver-1" ? { ...current, employeeRole: "DeliveryStaff", employeeStatus: "Active", paymentProvider: "cash", paymentStatus: "pending", simulated: false, codAmountVnd: 100000 } : null),
            updateStatus: vi.fn(async (_tx, _id, _employeeId, status, reason) => { current = assignment({ status, failureReason: reason || null }); }),
            getAssignment: vi.fn(async () => current),
            getAssignmentForStaff: vi.fn(async (id, employeeId) => id === 7 && employeeId === "driver-1" ? current : null),
            listForStaff: vi.fn(async () => [current]),
            customerSummary: vi.fn(async () => null),
            listAssignableOrders: vi.fn(async () => []),
        } as unknown as DeliveryAssignmentRepository;
        service = new DeliveryAssignmentService(repository, { recordCollection: vi.fn() } as never, { emit: vi.fn(), emitPaymentConfirmed: vi.fn() } as never, { awardPaidOrder: vi.fn() } as never);
    });

    it("rejects overlapping schedules before creating an assignment", async () => {
        vi.mocked(repository.findScheduleConflict).mockResolvedValue({ id: 8 } as never);

        await expect(service.assign({ orderId: 42, employeeId: "driver-1", scheduledStartAt: new Date("2026-10-17T02:00:00Z"), scheduledEndAt: new Date("2026-10-17T03:00:00Z") }, "admin-1"))
            .rejects.toMatchObject({ status: 409 });
        expect(repository.createAssignment).not.toHaveBeenCalled();
    });

    it("rejects suspended staff and simulated PayOS orders before assignment", async () => {
        vi.mocked(repository.lockEmployee).mockResolvedValue({ id: "driver-1", role: "DeliveryStaff", status: "Suspended", name: "Driver One" });
        await expect(service.assign({ orderId: 42, employeeId: "driver-1", scheduledStartAt: new Date("2026-10-17T02:00:00Z"), scheduledEndAt: new Date("2026-10-17T03:00:00Z") }, "admin-1"))
            .rejects.toMatchObject({ status: 404 });
        expect(repository.createAssignment).not.toHaveBeenCalled();

        vi.mocked(repository.lockEmployee).mockResolvedValue({ id: "driver-1", role: "DeliveryStaff", status: "Active", name: "Driver One" });
        vi.mocked(repository.lockEligibleOrder).mockResolvedValue({ id: 42, status: 0, currency: "VND", deliverySnapshot: { provider: "INTERNAL" }, shipmentState: "READY_TO_SHIP", shipmentProvider: "INTERNAL", paymentProvider: "payos", paymentStatus: "paid", simulated: true, codAmountVnd: 0 });
        await expect(service.assign({ orderId: 42, employeeId: "driver-1", scheduledStartAt: new Date("2026-10-17T02:00:00Z"), scheduledEndAt: new Date("2026-10-17T03:00:00Z") }, "admin-1"))
            .rejects.toMatchObject({ status: 409 });
        expect(repository.createAssignment).not.toHaveBeenCalled();
    });

    it("preserves the previous assignment as history when reassigning before dispatch", async () => {
        vi.mocked(repository.findActiveAssignmentsForOrder).mockResolvedValue([{ id: 6, status: "ASSIGNED" }] as never);
        vi.mocked(repository.nextAttemptNumber).mockResolvedValue(2);

        await service.assign({ orderId: 42, employeeId: "driver-1", scheduledStartAt: new Date("2026-10-17T02:00:00Z"), scheduledEndAt: new Date("2026-10-17T03:00:00Z") }, "admin-1");

        expect(repository.markReassigned).toHaveBeenCalledWith(expect.anything(), 6, "admin-1");
        expect(repository.createAssignment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attemptNumber: 2 }));
    });

    it("refuses to add another assignment when an order has duplicate active history", async () => {
        vi.mocked(repository.findActiveAssignmentsForOrder).mockResolvedValue([
            { id: 8, status: "ASSIGNED" },
            { id: 7, status: "ASSIGNED" },
        ] as never);

        await expect(service.assign({ orderId: 42, employeeId: "driver-1", scheduledStartAt: new Date("2026-10-17T02:00:00Z"), scheduledEndAt: new Date("2026-10-17T03:00:00Z") }, "admin-1"))
            .rejects.toMatchObject({ status: 409 });
        expect(repository.createAssignment).not.toHaveBeenCalled();
        expect(repository.markReassigned).not.toHaveBeenCalled();
    });

    it("requires dispatch before a failed delivery and records the failure reason", async () => {
        await expect(service.transition({ assignmentId: 7, employeeId: "driver-1", status: "DELIVERY_FAILED", failureReason: "Customer unavailable" }))
            .rejects.toMatchObject({ status: 409 });
        expect(repository.updateStatus).not.toHaveBeenCalled();

        current = assignment({ status: "OUT_FOR_DELIVERY" });
        await service.transition({ assignmentId: 7, employeeId: "driver-1", status: "DELIVERY_FAILED", failureReason: "Customer unavailable" });
        expect(repository.updateStatus).toHaveBeenCalledWith(expect.anything(), 7, "driver-1", "DELIVERY_FAILED", "Customer unavailable");
    });

    it("allows an assigned delivery to start", async () => {
        current = assignment();
        await service.transition({ assignmentId: 7, employeeId: "driver-1", status: "OUT_FOR_DELIVERY" });
        expect(repository.updateStatus).toHaveBeenCalledWith(expect.anything(), 7, "driver-1", "OUT_FOR_DELIVERY", undefined);
    });

    it("makes duplicate delivered writes idempotent and keeps delivery terminal", async () => {
        current = assignment({ status: "OUT_FOR_DELIVERY" });
        const cod = { recordCollection: vi.fn() };
        const emails = { emit: vi.fn(), emitPaymentConfirmed: vi.fn() };
        const loyalty = { awardPaidOrder: vi.fn() };
        service = new DeliveryAssignmentService(repository, cod as never, emails as never, loyalty as never);

        await service.transition({ assignmentId: 7, employeeId: "driver-1", status: "DELIVERED" });
        expect(cod.recordCollection).toHaveBeenCalledOnce();
        expect(loyalty.awardPaidOrder).toHaveBeenCalledOnce();
        expect(emails.emitPaymentConfirmed).toHaveBeenCalledOnce();

        await service.transition({ assignmentId: 7, employeeId: "driver-1", status: "DELIVERED" });
        await expect(service.transition({ assignmentId: 7, employeeId: "driver-1", status: "OUT_FOR_DELIVERY" })).rejects.toMatchObject({ status: 409 });
        expect(cod.recordCollection).toHaveBeenCalledOnce();
        expect(loyalty.awardPaidOrder).toHaveBeenCalledOnce();
        expect(emails.emitPaymentConfirmed).toHaveBeenCalledOnce();
    });

    it("does not return another employee's assignment", async () => {
        await expect(service.getForStaff(7, "driver-2")).rejects.toMatchObject({ status: 404 });
        expect(repository.getAssignmentForStaff).toHaveBeenCalledWith(7, "driver-2");
    });
});
