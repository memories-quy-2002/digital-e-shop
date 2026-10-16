import { Injectable } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { parseJson } from "./shipping-json";
import type { InternalDeliveryAddress } from "./shipping.types";

export type DeliveryStatus = "ASSIGNED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "DELIVERY_FAILED";
export type DeliveryEvent = { id: number; status: DeliveryStatus | null; actorId: string | null; publicNote: string | null; createdAt: string };
export type DeliveryOrderItem = { productName: string; sku: string | null; quantity: number; unitPriceVnd: number; totalPriceVnd: number };
export type DeliveryAssignment = {
    id: number;
    orderId: number;
    employeeId: string;
    employeeName: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    status: DeliveryStatus | "REASSIGNED";
    failureReason: string | null;
    events: DeliveryEvent[];
    order?: { destination: InternalDeliveryAddress | null; paymentMethod: string | null; codAmountVnd: number; items: DeliveryOrderItem[] };
};
export type CustomerDeliverySummary = Omit<DeliveryAssignment, "failureReason" | "employeeId" | "events" | "order"> & {
    events: Array<Omit<DeliveryEvent, "actorId">>;
};
export type LockedEmployee = { id: string; role: string; status: string; name: string };
export type LockedDeliveryOrder = {
    id: number;
    status: number;
    currency: string;
    deliverySnapshot: string | object | null;
    shipmentState: string | null;
    shipmentProvider: string | null;
    paymentProvider: string | null;
    paymentStatus: string | null;
    simulated: boolean;
    codAmountVnd: number;
};
export type LockedDeliveryAssignment = DeliveryAssignment & {
    employeeStatus: string;
    employeeRole: string;
    paymentProvider: string | null;
    paymentStatus: string | null;
    simulated: boolean;
    codAmountVnd: number;
};

type RawRow = Record<string, unknown>;

const asIso = (value: unknown): string => {
    if (value instanceof Date) return value.toISOString();
    const text = String(value ?? "");
    if (!text) return "";
    return new Date(text.includes("T") ? text : `${text.replace(" ", "T")}Z`).toISOString();
};
const text = (value: unknown): string => value == null ? "" : String(value);
const finite = (value: unknown): number => Number(value) || 0;
const displayName = (row: RawRow): string => {
    const fullName = [row.first_name, row.last_name].map(text).filter(Boolean).join(" ").trim();
    return fullName || text(row.username) || "Delivery staff";
};
const destinationFromSnapshot = (value: unknown): InternalDeliveryAddress | null => {
    if (!value) return null;
    try {
        const snapshot = parseJson<{ address?: InternalDeliveryAddress }>(value as string | object);
        return snapshot.address || null;
    } catch {
        return null;
    }
};

@Injectable()
export class DeliveryAssignmentRepository {
    transaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async lockEmployee(tx: TransactionContext, employeeId: string): Promise<LockedEmployee | null> {
        const [row] = await tx.query<RawRow[]>("SELECT id, role, status, first_name, last_name, username FROM users WHERE id = ? FOR UPDATE", [employeeId]);
        return row ? { id: text(row.id), role: text(row.role), status: text(row.status), name: displayName(row) } : null;
    }

    async lockEligibleOrder(tx: TransactionContext, orderId: number): Promise<LockedDeliveryOrder | null> {
        const [order] = await tx.query<RawRow[]>("SELECT id, status, currency, delivery_snapshot FROM orders WHERE id = ? FOR UPDATE", [orderId]);
        if (!order) return null;
        const [shipment] = await tx.query<RawRow[]>("SELECT state, provider, expected_cod_vnd FROM shipments WHERE order_id = ? FOR UPDATE", [orderId]);
        const [payment] = await tx.query<RawRow[]>("SELECT provider, status, simulated FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [orderId]);
        return {
            id: finite(order.id), status: finite(order.status), currency: text(order.currency), deliverySnapshot: order.delivery_snapshot as string | object | null,
            shipmentState: shipment ? text(shipment.state) : null, shipmentProvider: shipment ? text(shipment.provider) : null,
            paymentProvider: payment ? text(payment.provider) : null,
            paymentStatus: payment ? text(payment.status) : null, simulated: Boolean(payment?.simulated), codAmountVnd: finite(shipment?.expected_cod_vnd),
        };
    }

    async lockOrder(tx: TransactionContext, orderId: number): Promise<void> {
        const [row] = await tx.query<RawRow[]>("SELECT id FROM orders WHERE id = ? FOR UPDATE", [orderId]);
        if (!row) throw Object.assign(new Error("Order not found"), { statusCode: 404 });
    }

    async findOrderIdForStaff(tx: TransactionContext, assignmentId: number, employeeId: string): Promise<number | null> {
        const [row] = await tx.query<RawRow[]>("SELECT order_id FROM delivery_assignments WHERE id = ? AND employee_id = ?", [assignmentId, employeeId]);
        return row ? finite(row.order_id) : null;
    }

    async findActiveAssignmentsForOrder(tx: TransactionContext, orderId: number): Promise<Array<{ id: number; status: DeliveryStatus }>> {
        const rows = await tx.query<RawRow[]>("SELECT id, status FROM delivery_assignments WHERE order_id = ? AND status IN ('ASSIGNED', 'OUT_FOR_DELIVERY') ORDER BY id DESC FOR UPDATE", [orderId]);
        return rows.map((row) => ({ id: finite(row.id), status: text(row.status) as DeliveryStatus }));
    }

    async findScheduleConflict(tx: TransactionContext, employeeId: string, start: Date, end: Date): Promise<{ id: number } | null> {
        const [row] = await tx.query<RawRow[]>(`SELECT id FROM delivery_assignments
            WHERE employee_id = ? AND status IN ('ASSIGNED', 'OUT_FOR_DELIVERY')
              AND scheduled_start_at < ? AND scheduled_end_at > ?
            ORDER BY id LIMIT 1 FOR UPDATE`, [employeeId, end, start]);
        return row ? { id: finite(row.id) } : null;
    }

    async nextAttemptNumber(tx: TransactionContext, orderId: number): Promise<number> {
        const [row] = await tx.query<RawRow[]>("SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt FROM delivery_assignments WHERE order_id = ?", [orderId]);
        return Math.max(1, finite(row?.next_attempt));
    }

    async markReassigned(tx: TransactionContext, assignmentId: number, actorId: string): Promise<void> {
        await tx.query("UPDATE delivery_assignments SET status = 'REASSIGNED', updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND status = 'ASSIGNED'", [assignmentId]);
        const [assignment] = await tx.query<RawRow[]>("SELECT order_id FROM delivery_assignments WHERE id = ?", [assignmentId]);
        if (!assignment) throw new Error("Delivery assignment was not found during reassignment");
        await this.appendEvent(tx, assignmentId, finite(assignment.order_id), "REASSIGNED", null, actorId, "Delivery assignment was changed by the store");
    }

    async createAssignment(tx: TransactionContext, input: { orderId: number; employeeId: string; assignedById: string; scheduledStartAt: Date; scheduledEndAt: Date; attemptNumber: number }): Promise<DeliveryAssignment> {
        const result = await tx.query<{ insertId: number }>(`INSERT INTO delivery_assignments
            (order_id, employee_id, assigned_by_id, scheduled_start_at, scheduled_end_at, status, attempt_number)
            VALUES (?, ?, ?, ?, ?, 'ASSIGNED', ?)`, [input.orderId, input.employeeId, input.assignedById, input.scheduledStartAt, input.scheduledEndAt, input.attemptNumber]);
        const assignmentId = Number(result.insertId);
        await this.appendEvent(tx, assignmentId, input.orderId, "ASSIGNED", "ASSIGNED", input.assignedById, "Delivery was assigned");
        const assignment = await this.getAssignment(tx, assignmentId);
        if (!assignment) throw new Error("Created delivery assignment could not be loaded");
        return assignment;
    }

    async appendEvent(tx: TransactionContext, assignmentId: number, orderId: number, eventType: string, status: string | null, actorId: string | null, publicNote: string | null): Promise<void> {
        await tx.query(`INSERT INTO delivery_events (assignment_id, order_id, event_type, status, actor_id, public_note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))`, [assignmentId, orderId, eventType, status, actorId, publicNote]);
    }

    async lockAssignmentForStaff(tx: TransactionContext, assignmentId: number, employeeId: string, employee: LockedEmployee): Promise<LockedDeliveryAssignment | null> {
        const [row] = await tx.query<RawRow[]>(`SELECT a.id, a.order_id, a.employee_id, a.scheduled_start_at, a.scheduled_end_at,
                a.status, a.failure_reason,
                (SELECT provider FROM order_payments WHERE order_id = a.order_id ORDER BY id DESC LIMIT 1) AS payment_provider,
                (SELECT status FROM order_payments WHERE order_id = a.order_id ORDER BY id DESC LIMIT 1) AS payment_status,
                (SELECT simulated FROM order_payments WHERE order_id = a.order_id ORDER BY id DESC LIMIT 1) AS simulated,
                COALESCE((SELECT expected_cod_vnd FROM shipments WHERE order_id = a.order_id LIMIT 1), 0) AS cod_amount_vnd
            FROM delivery_assignments a WHERE a.id = ? AND a.employee_id = ? FOR UPDATE`, [assignmentId, employeeId]);
        if (!row) return null;
        return {
            id: finite(row.id), orderId: finite(row.order_id), employeeId: text(row.employee_id), employeeName: employee.name,
            scheduledStartAt: asIso(row.scheduled_start_at), scheduledEndAt: asIso(row.scheduled_end_at), status: text(row.status) as DeliveryStatus,
            failureReason: row.failure_reason == null ? null : text(row.failure_reason), events: [], employeeStatus: employee.status, employeeRole: employee.role,
            paymentProvider: row.payment_provider == null ? null : text(row.payment_provider), paymentStatus: row.payment_status == null ? null : text(row.payment_status),
            simulated: Boolean(row.simulated), codAmountVnd: finite(row.cod_amount_vnd),
        };
    }

    async updateStatus(tx: TransactionContext, assignmentId: number, employeeId: string, status: DeliveryStatus, reason?: string): Promise<void> {
        const result = await tx.query<{ affectedRows: number }>(`UPDATE delivery_assignments SET status = ?, failure_reason = ?, updated_at = UTC_TIMESTAMP(3)
            WHERE id = ? AND employee_id = ?`, [status, reason || null, assignmentId, employeeId]);
        if (result.affectedRows !== 1) throw Object.assign(new Error("Delivery assignment changed while updating"), { statusCode: 409 });
    }

    async getAssignment(tx: TransactionContext, assignmentId: number): Promise<DeliveryAssignment | null> {
        const rows = await tx.query<RawRow[]>(`${this.assignmentSelect()} WHERE a.id = ?`, [assignmentId]);
        return (await this.mapAssignments(tx, rows))[0] || null;
    }

    async getAssignmentForStaff(assignmentId: number, employeeId: string): Promise<DeliveryAssignment | null> {
        return this.transaction(async (tx) => {
            const rows = await tx.query<RawRow[]>(`${this.assignmentSelect()} WHERE a.id = ? AND a.employee_id = ?`, [assignmentId, employeeId]);
            return (await this.mapAssignments(tx, rows))[0] || null;
        });
    }

    async listForStaff(employeeId: string): Promise<DeliveryAssignment[]> {
        return this.transaction(async (tx) => {
            const rows = await tx.query<RawRow[]>(`${this.assignmentSelect()} WHERE a.employee_id = ? AND a.status <> 'REASSIGNED'
                ORDER BY a.scheduled_start_at DESC, a.id DESC LIMIT 100`, [employeeId]);
            return this.mapAssignments(tx, rows);
        });
    }

    async customerSummary(orderId: number): Promise<CustomerDeliverySummary | null> {
        return this.transaction(async (tx) => {
            const [row] = await tx.query<RawRow[]>(`SELECT a.id, a.order_id, a.scheduled_start_at, a.scheduled_end_at, a.status,
                    u.first_name, u.last_name, u.username
                FROM delivery_assignments a JOIN users u ON u.id = a.employee_id
                WHERE a.order_id = ? AND a.status <> 'REASSIGNED' ORDER BY a.id DESC LIMIT 1`, [orderId]);
            if (!row) return null;
            const events = await tx.query<RawRow[]>(`SELECT id, status, public_note, created_at FROM delivery_events
                WHERE assignment_id = ? ORDER BY id`, [finite(row.id)]);
            return {
                id: finite(row.id), orderId: finite(row.order_id), employeeName: displayName(row),
                scheduledStartAt: asIso(row.scheduled_start_at), scheduledEndAt: asIso(row.scheduled_end_at), status: text(row.status) as DeliveryStatus,
                events: events.map((event) => ({
                    id: finite(event.id), status: event.status == null ? null : text(event.status) as DeliveryStatus,
                    publicNote: event.public_note == null ? null : text(event.public_note), createdAt: asIso(event.created_at),
                })),
            };
        });
    }

    async assignmentHistory(orderId: number): Promise<DeliveryAssignment[]> {
        return this.transaction(async (tx) => {
            const rows = await tx.query<RawRow[]>(`${this.assignmentSelect()} WHERE a.order_id = ? ORDER BY a.id DESC`, [orderId]);
            return this.mapAssignments(tx, rows);
        });
    }

    async listAssignableOrders() {
        return this.transaction(async (tx) => {
            const rows = await tx.query<RawRow[]>(`SELECT o.id, o.date_added, o.delivery_snapshot, o.contact_snapshot, s.expected_cod_vnd,
                    p.provider AS payment_provider, p.status AS payment_status, p.simulated
                FROM orders o JOIN shipments s ON s.order_id = o.id
                JOIN (SELECT op.order_id, MAX(op.id) AS payment_id FROM order_payments op GROUP BY op.order_id) latest ON latest.order_id = o.id
                JOIN order_payments p ON p.id = latest.payment_id
                WHERE o.status = 0 AND o.currency = 'VND' AND s.provider = 'INTERNAL' AND s.state = 'READY_TO_SHIP'
                    AND JSON_UNQUOTE(JSON_EXTRACT(o.delivery_snapshot, '$.provider')) = 'INTERNAL'
                    AND NOT EXISTS (SELECT 1 FROM delivery_assignments a WHERE a.order_id = o.id AND a.status = 'OUT_FOR_DELIVERY')
                    AND ((p.provider = 'cash' AND p.status IN ('pending', 'paid')) OR (p.provider = 'payos' AND p.status = 'paid' AND p.simulated = 0))
                ORDER BY o.date_added ASC, o.id ASC LIMIT 100`);
            const orderIds = rows.map((row) => finite(row.id));
            const [itemRows, currentRows] = orderIds.length ? await Promise.all([
                tx.query<RawRow[]>(`SELECT order_id, product_name_snapshot AS product_name, sku_snapshot AS sku, quantity,
                        COALESCE(unit_price_snapshot, total_price / NULLIF(quantity, 0)) AS price
                    FROM order_items WHERE order_id IN (?) ORDER BY id`, [orderIds]),
                tx.query<RawRow[]>(`SELECT a.id, a.order_id, a.employee_id, a.scheduled_start_at, a.scheduled_end_at,
                        u.first_name, u.last_name, u.username
                    FROM delivery_assignments a JOIN users u ON u.id = a.employee_id
                    WHERE a.order_id IN (?) AND a.status = 'ASSIGNED' ORDER BY a.id DESC`, [orderIds]),
            ]) : [[], []];
            const itemsByOrder = new Map<number, DeliveryOrderItem[]>();
            const currentByOrder = new Map<number, { id: number; employeeId: string; employeeName: string; scheduledStartAt: string; scheduledEndAt: string }>();
            for (const row of currentRows) {
                const orderId = finite(row.order_id);
                if (currentByOrder.has(orderId)) continue;
                currentByOrder.set(orderId, {
                    id: finite(row.id), employeeId: text(row.employee_id), employeeName: displayName(row),
                    scheduledStartAt: asIso(row.scheduled_start_at), scheduledEndAt: asIso(row.scheduled_end_at),
                });
            }
            for (const row of itemRows) {
                const id = finite(row.order_id);
                const list = itemsByOrder.get(id) || [];
                const quantity = finite(row.quantity);
                const unitPriceVnd = finite(row.price);
                list.push({ productName: text(row.product_name), sku: row.sku == null ? null : text(row.sku), quantity, unitPriceVnd, totalPriceVnd: quantity * unitPriceVnd });
                itemsByOrder.set(id, list);
            }
            return rows.map((row) => {
                let customerName = "Customer";
                if (row.contact_snapshot) {
                    try { customerName = parseJson<{ name?: string }>(row.contact_snapshot as string | object).name || customerName; } catch { /* Keep the queue usable for legacy contact snapshots. */ }
                }
                return {
                    orderId: finite(row.id), createdAt: asIso(row.date_added), customerName,
                    destination: destinationFromSnapshot(row.delivery_snapshot), paymentMethod: text(row.payment_provider),
                    paymentStatus: text(row.payment_status), codAmountVnd: finite(row.expected_cod_vnd),
                    items: itemsByOrder.get(finite(row.id)) || [], currentAssignment: currentByOrder.get(finite(row.id)) || null,
                };
            });
        });
    }

    private assignmentSelect() {
        return `SELECT a.id, a.order_id, a.employee_id, a.scheduled_start_at, a.scheduled_end_at, a.status, a.failure_reason,
                u.first_name, u.last_name, u.username, o.delivery_snapshot, s.expected_cod_vnd,
                (SELECT provider FROM order_payments WHERE order_id = a.order_id ORDER BY id DESC LIMIT 1) AS payment_provider
            FROM delivery_assignments a JOIN users u ON u.id = a.employee_id JOIN orders o ON o.id = a.order_id
            LEFT JOIN shipments s ON s.order_id = a.order_id`;
    }

    private async mapAssignments(tx: TransactionContext, rows: RawRow[]): Promise<DeliveryAssignment[]> {
        if (!rows.length) return [];
        const ids = rows.map((row) => finite(row.id));
        const orderIds = rows.map((row) => finite(row.order_id));
        const [events, items] = await Promise.all([
            tx.query<RawRow[]>("SELECT id, assignment_id, status, actor_id, public_note, created_at FROM delivery_events WHERE assignment_id IN (?) ORDER BY id", [ids]),
            tx.query<RawRow[]>(`SELECT order_id, product_name_snapshot AS product_name, sku_snapshot AS sku, quantity,
                    COALESCE(unit_price_snapshot, total_price / NULLIF(quantity, 0)) AS price
                FROM order_items WHERE order_id IN (?) ORDER BY id`, [orderIds]),
        ]);
        const eventsByAssignment = new Map<number, DeliveryEvent[]>();
        for (const row of events) {
            const id = finite(row.assignment_id);
            const list = eventsByAssignment.get(id) || [];
            list.push({ id: finite(row.id), status: row.status == null ? null : text(row.status) as DeliveryStatus, actorId: row.actor_id == null ? null : text(row.actor_id), publicNote: row.public_note == null ? null : text(row.public_note), createdAt: asIso(row.created_at) });
            eventsByAssignment.set(id, list);
        }
        const itemsByOrder = new Map<number, DeliveryOrderItem[]>();
        for (const row of items) {
            const id = finite(row.order_id);
            const quantity = finite(row.quantity);
            const unitPriceVnd = finite(row.price);
            const list = itemsByOrder.get(id) || [];
            list.push({ productName: text(row.product_name), sku: row.sku == null ? null : text(row.sku), quantity, unitPriceVnd, totalPriceVnd: quantity * unitPriceVnd });
            itemsByOrder.set(id, list);
        }
        return rows.map((row) => {
            const orderId = finite(row.order_id);
            return {
                id: finite(row.id), orderId, employeeId: text(row.employee_id), employeeName: displayName(row),
                scheduledStartAt: asIso(row.scheduled_start_at), scheduledEndAt: asIso(row.scheduled_end_at), status: text(row.status) as DeliveryStatus,
                failureReason: row.failure_reason == null ? null : text(row.failure_reason), events: eventsByAssignment.get(finite(row.id)) || [],
                order: { destination: destinationFromSnapshot(row.delivery_snapshot), paymentMethod: row.payment_provider == null ? null : text(row.payment_provider), codAmountVnd: finite(row.expected_cod_vnd), items: itemsByOrder.get(orderId) || [] },
            };
        });
    }
}
