import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { completeDeliveredOrder } from "../orders/order-delivery";
import { CodSettlementService } from "../payments/cod-settlement.service";
import { OrderEmailService } from "../orders/order-email.service";
import { LoyaltyService } from "../loyalty/loyalty.service";
import { USER_ACCOUNT_STATUS, USER_ROLE } from "../shared/constants/user";
import { DeliveryAssignmentRepository, type DeliveryAssignment, type DeliveryStatus, type LockedDeliveryOrder } from "./delivery-assignment.repository";
import { parseJson } from "./shipping-json";

const isInternalSnapshot = (snapshot: string | object | null): boolean => {
    if (!snapshot) return false;
    try {
        return parseJson<{ provider?: string }>(snapshot).provider === "INTERNAL";
    } catch {
        return false;
    }
};

const publicNoteFor = (status: DeliveryStatus): string => {
    switch (status) {
        case "ASSIGNED": return "Delivery was assigned";
        case "OUT_FOR_DELIVERY": return "Delivery is on the way";
        case "DELIVERED": return "Order was delivered";
        case "DELIVERY_FAILED": return "Delivery could not be completed";
    }
};

@Injectable()
export class DeliveryAssignmentService {
    constructor(
        private readonly repository: DeliveryAssignmentRepository,
        private readonly cod: CodSettlementService,
        private readonly emails: OrderEmailService,
        private readonly loyalty: LoyaltyService,
    ) {}

    async assign(input: { orderId: number; employeeId: string; scheduledStartAt: Date; scheduledEndAt: Date }, adminId: string): Promise<DeliveryAssignment> {
        if (!Number.isSafeInteger(input.orderId) || input.orderId < 1 || !adminId) throw new ConflictException("A valid order and administrator are required");
        if (!(input.scheduledStartAt instanceof Date) || !(input.scheduledEndAt instanceof Date)
            || !Number.isFinite(input.scheduledStartAt.getTime()) || !Number.isFinite(input.scheduledEndAt.getTime())
            || input.scheduledEndAt <= input.scheduledStartAt) throw new ConflictException("A valid delivery schedule is required");

        return this.repository.transaction(async (tx) => {
            // Lock in order → employee → assignment order to avoid cycles with status updates.
            const order = await this.repository.lockEligibleOrder(tx, input.orderId);
            if (!order) throw new NotFoundException("Order not found");
            this.assertEligibleOrder(order);

            const employee = await this.repository.lockEmployee(tx, input.employeeId);
            if (!employee || employee.role !== USER_ROLE.DELIVERY_STAFF || employee.status !== USER_ACCOUNT_STATUS.ACTIVE) {
                throw new NotFoundException("Active delivery staff member not found");
            }

            const activeAssignments = await this.repository.findActiveAssignmentsForOrder(tx, input.orderId);
            if (activeAssignments.length > 1) throw new ConflictException("Order has multiple active assignments and needs admin review");
            const active = activeAssignments[0];
            if (active?.status === "OUT_FOR_DELIVERY") throw new ConflictException("A delivery already in progress cannot be reassigned");
            if (active?.status === "ASSIGNED") await this.repository.markReassigned(tx, active.id, adminId);

            const overlap = await this.repository.findScheduleConflict(tx, input.employeeId, input.scheduledStartAt, input.scheduledEndAt);
            if (overlap) throw new ConflictException("Delivery staff member already has an overlapping assignment");

            const attemptNumber = await this.repository.nextAttemptNumber(tx, input.orderId);
            return this.repository.createAssignment(tx, {
                orderId: input.orderId,
                employeeId: input.employeeId,
                assignedById: adminId,
                scheduledStartAt: input.scheduledStartAt,
                scheduledEndAt: input.scheduledEndAt,
                attemptNumber,
            });
        });
    }

    listForStaff(employeeId: string): Promise<DeliveryAssignment[]> {
        if (!employeeId) throw new NotFoundException("Delivery staff member not found");
        return this.repository.listForStaff(employeeId);
    }

    async getForStaff(assignmentId: number, employeeId: string): Promise<DeliveryAssignment> {
        const assignment = await this.repository.getAssignmentForStaff(assignmentId, employeeId);
        if (!assignment) throw new NotFoundException("Delivery assignment not found");
        return assignment;
    }

    async transition(input: { assignmentId: number; employeeId: string; status: DeliveryStatus; failureReason?: string }): Promise<DeliveryAssignment> {
        if (!Number.isSafeInteger(input.assignmentId) || input.assignmentId < 1 || !input.employeeId) throw new NotFoundException("Delivery assignment not found");
        const failureReason = input.failureReason?.trim();
        if (input.status === "DELIVERY_FAILED" && (!failureReason || failureReason.length < 3 || failureReason.length > 500)) {
            throw new ConflictException("A valid reason is required when delivery fails");
        }
        if (input.status !== "DELIVERY_FAILED" && input.failureReason) throw new ConflictException("Failure reason is only valid for a failed delivery");

        return this.repository.transaction(async (tx) => {
            const orderId = await this.repository.findOrderIdForStaff(tx, input.assignmentId, input.employeeId);
            if (!orderId) throw new NotFoundException("Delivery assignment not found");
            await this.repository.lockOrder(tx, orderId);
            const employee = await this.repository.lockEmployee(tx, input.employeeId);
            if (!employee || employee.role !== USER_ROLE.DELIVERY_STAFF || employee.status !== USER_ACCOUNT_STATUS.ACTIVE) {
                throw new NotFoundException("Delivery assignment not found");
            }
            const assignment = await this.repository.lockAssignmentForStaff(tx, input.assignmentId, input.employeeId, employee);
            if (!assignment) throw new NotFoundException("Delivery assignment not found");
            if (assignment.employeeRole !== USER_ROLE.DELIVERY_STAFF || assignment.employeeStatus !== USER_ACCOUNT_STATUS.ACTIVE) {
                throw new NotFoundException("Delivery assignment not found");
            }

            if (assignment.status === input.status) return this.requireAssignment(await this.repository.getAssignment(tx, input.assignmentId));
            if (assignment.status === "ASSIGNED") {
                if (input.status !== "OUT_FOR_DELIVERY") throw new ConflictException("Start the delivery before recording its outcome");
            } else if (assignment.status === "OUT_FOR_DELIVERY") {
                if (input.status !== "DELIVERED" && input.status !== "DELIVERY_FAILED") throw new ConflictException("Delivery status cannot transition from its current state");
            } else {
                throw new ConflictException("Delivery status cannot transition from its current state");
            }

            const status = input.status;
            await this.repository.updateStatus(tx, input.assignmentId, input.employeeId, status, status === "DELIVERY_FAILED" ? failureReason : undefined);
            await this.repository.appendEvent(tx, input.assignmentId, assignment.orderId, "STATUS_CHANGED", status, input.employeeId, publicNoteFor(status));

            if (status === "DELIVERED") {
                this.assertEligiblePayment(assignment.paymentProvider, assignment.paymentStatus, assignment.simulated);
                await this.cod.recordCollection(tx, assignment.orderId, assignment.codAmountVnd);
                const completed = await completeDeliveredOrder(tx, assignment.orderId, new Date(), input.employeeId);
                if (completed) await this.loyalty.awardPaidOrder(tx, assignment.orderId);
                if (completed) await this.emails.emitPaymentConfirmed(tx, assignment.orderId);
            }
            await this.emails.emit(tx, assignment.orderId, "shipment", {
                key: `delivery:${assignment.id}:status:${status}`,
                status,
            });

            return this.requireAssignment(await this.repository.getAssignment(tx, input.assignmentId));
        });
    }

    customerSummary(orderId: number) { return this.repository.customerSummary(orderId); }
    assignmentHistory(orderId: number) { return this.repository.assignmentHistory(orderId); }
    listAssignableOrders() { return this.repository.listAssignableOrders(); }
    private assertEligibleOrder(order: LockedDeliveryOrder): void {
        if (order.status !== 0 || order.currency !== "VND" || !isInternalSnapshot(order.deliverySnapshot)) {
            throw new ConflictException("Only pending VND internal-delivery orders can be assigned");
        }
        if (order.shipmentProvider !== "INTERNAL" || order.shipmentState !== "READY_TO_SHIP") {
            throw new ConflictException("Order must have an internal shipment packed and ready to ship before assignment");
        }
        this.assertEligiblePayment(order.paymentProvider, order.paymentStatus, order.simulated);
    }

    private assertEligiblePayment(provider: string | null, status: string | null, simulated: boolean): void {
        const cashOrder = provider === "cash" && (status === "pending" || status === "paid");
        const verifiedPayOS = provider === "payos" && status === "paid" && !simulated;
        if (!cashOrder && !verifiedPayOS) throw new ConflictException("Order payment is not eligible for delivery");
    }

    private requireAssignment(assignment: DeliveryAssignment | null): DeliveryAssignment {
        if (!assignment) throw new NotFoundException("Delivery assignment not found");
        return assignment;
    }
}
