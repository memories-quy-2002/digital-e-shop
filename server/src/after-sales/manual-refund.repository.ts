import { Injectable } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "#src/database/transaction";

export type ManualRefundRequest = {
    id: number; orderId: number; status: string; reason?: string; refundAmount?: number | null;
    refundCurrency?: string | null; refundReference?: string | null;
};
export type ManualRefundPayment = { id: number; status: string; amount: number; refundedAmount: number; currency: string; simulated: boolean | number; paidAt?: string | null };
export type ManualRefundOrder = { id: number; currency: string; discount: number; pricingSnapshot: unknown; guestEmail?: string | null; guestName?: string | null; contactEmail?: string | null; contactName?: string | null; contactLocale?: "en" | "vi" };
export type ManualRefundItem = { orderItemId: number; quantity: number; unitPrice: number; requestedQuantity: number };
export type RefundedUnit = { orderItemId: number; unitIndex: number };
export type ManualRefundContext = {
    request: ManualRefundRequest;
    order: ManualRefundOrder;
    payment: ManualRefundPayment | null;
    items: ManualRefundItem[];
    refundedUnits: RefundedUnit[];
};
export type ManualRefundInputRecord = {
    idempotencyKey: string; transferReference: string; transferDate: string; reviewedReason: string;
    evidenceId: number; currency: "VND"; amountVnd: number;
};
export type ManualRefundOperation = ManualRefundInputRecord & { id: number; requestId: number; actorId: string };
export type RefundableAllocation = RefundedUnit & { netVnd: number };

export type ManualRefundRepositoryPort = {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
    getContextForUpdate(tx: TransactionContext, requestId: number): Promise<ManualRefundContext | null>;
    findOperationByKey(tx: TransactionContext, key: string): Promise<ManualRefundOperation | null>;
    findOperationByReference(tx: TransactionContext, reference: string): Promise<ManualRefundOperation | null>;
    insertOperation(tx: TransactionContext, input: ManualRefundInputRecord & { requestId: number; orderPaymentId: number; actorId: string }, units: RefundableAllocation[]): Promise<void>;
    completeRefund(tx: TransactionContext, input: ManualRefundInputRecord & { requestId: number; orderId: number; requestReason: string; paymentId: number; actorId: string; fromStatus: string }): Promise<ManualRefundRequest>;
};

type RawRow = Record<string, unknown>;
type QueryResult = { affectedRows?: number; insertId?: number };
const dateValue = (value: unknown): string => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);

const parseVnd = (value: unknown): number => {
    const text = String(value ?? "0");
    if (!/^\d+(?:\.0+)?$/.test(text)) throw new Error("Stored VND value is not an integer amount");
    const amount = Number(text);
    if (!Number.isSafeInteger(amount)) throw new Error("Stored VND value exceeds the safe integer range");
    return amount;
};

@Injectable()
export class ManualRefundRepository implements ManualRefundRepositoryPort {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async getContextForUpdate(tx: TransactionContext, requestId: number): Promise<ManualRefundContext | null> {
        const requestRows = await tx.query<RawRow[]>(`SELECT id, order_id FROM after_sales_requests WHERE id = ? LIMIT 1`, [requestId]);
        if (!requestRows[0]) return null;
        const orderId = Number(requestRows[0].order_id);
        // Lock order before request, payment and allocated units to match order lifecycle locking.
        const orderRows = await tx.query<RawRow[]>(`SELECT o.id, o.currency, o.discount, o.pricing_snapshot, o.contact_snapshot, o.guest_email, o.guest_name,
                COALESCE(o.guest_email, u.email) AS contact_email,
                COALESCE(NULLIF(o.guest_name, ''), NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), ''), 'Customer') AS contact_name
            FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? LIMIT 1 FOR UPDATE`, [orderId]);
        if (!orderRows[0]) return null;
        const lockedRequestRows = await tx.query<RawRow[]>(`SELECT id, order_id, status, reason, refund_amount, refund_currency, refund_reference
            FROM after_sales_requests WHERE id = ? AND order_id = ? LIMIT 1 FOR UPDATE`, [requestId, orderId]);
        if (!lockedRequestRows[0]) return null;
        const paymentRows = await tx.query<RawRow[]>(`SELECT id, status, amount, refunded_amount, currency, simulated, paid_at
            FROM order_payments WHERE order_id = ? AND status IN ('paid', 'partially_refunded')
            ORDER BY paid_at DESC, id DESC LIMIT 1 FOR UPDATE`, [orderId]);
        const itemRows = await tx.query<RawRow[]>(`SELECT oi.id AS order_item_id, oi.quantity, oi.total_price,
                oi.unit_price_snapshot, asi.quantity AS requested_quantity
            FROM order_items oi LEFT JOIN after_sales_items asi ON asi.order_item_id = oi.id AND asi.request_id = ?
            WHERE oi.order_id = ? ORDER BY oi.id`, [requestId, orderId]);
        const refundedRows = await tx.query<RawRow[]>(`SELECT u.order_item_id, u.unit_index
            FROM manual_refund_units u JOIN order_items oi ON oi.id = u.order_item_id
            WHERE oi.order_id = ? ORDER BY u.order_item_id, u.unit_index FOR UPDATE`, [orderId]);
        const orderRow = orderRows[0];
        const contact = typeof orderRow.contact_snapshot === "string" ? JSON.parse(orderRow.contact_snapshot) : orderRow.contact_snapshot as { email?: string; name?: string; locale?: "en" | "vi" } | null;
        const payment = paymentRows[0];
        return {
            request: {
                id: Number(lockedRequestRows[0].id), orderId, status: String(lockedRequestRows[0].status),
                reason: String(lockedRequestRows[0].reason || ""),
                refundAmount: lockedRequestRows[0].refund_amount == null ? null : parseVnd(lockedRequestRows[0].refund_amount),
                refundCurrency: lockedRequestRows[0].refund_currency == null ? null : String(lockedRequestRows[0].refund_currency),
                refundReference: lockedRequestRows[0].refund_reference == null ? null : String(lockedRequestRows[0].refund_reference),
            },
            order: {
                id: orderId, currency: String(orderRow.currency || ""), discount: parseVnd(orderRow.discount),
                pricingSnapshot: typeof orderRow.pricing_snapshot === "string" ? JSON.parse(orderRow.pricing_snapshot) : orderRow.pricing_snapshot,
                guestEmail: orderRow.guest_email == null ? null : String(orderRow.guest_email),
                guestName: orderRow.guest_name == null ? null : String(orderRow.guest_name),
                contactEmail: contact?.email || (orderRow.contact_email == null ? null : String(orderRow.contact_email)),
                contactName: contact?.name || (orderRow.contact_name == null ? null : String(orderRow.contact_name)),
                contactLocale: contact?.locale || "en",
            },
            payment: payment ? {
                id: Number(payment.id), status: String(payment.status), amount: parseVnd(payment.amount),
                refundedAmount: parseVnd(payment.refunded_amount), currency: String(payment.currency || ""),
                simulated: payment.simulated as number, paidAt: payment.paid_at == null ? null : String(payment.paid_at),
            } : null,
            items: itemRows.map((row) => {
                const quantity = Number(row.quantity);
                const total = parseVnd(row.total_price);
                const unitPrice = row.unit_price_snapshot == null ? (quantity > 0 ? total / quantity : 0) : parseVnd(row.unit_price_snapshot);
                if (!Number.isSafeInteger(unitPrice)) throw new Error("Stored item snapshot cannot be represented in whole VND");
                return { orderItemId: Number(row.order_item_id), quantity, unitPrice, requestedQuantity: Number(row.requested_quantity || 0) };
            }),
            refundedUnits: refundedRows.map((row) => ({ orderItemId: Number(row.order_item_id), unitIndex: Number(row.unit_index) })),
        };
    }

    async findOperationByKey(tx: TransactionContext, key: string): Promise<ManualRefundOperation | null> {
        const rows = await tx.query<RawRow[]>(`SELECT id, request_id, order_payment_id, actor_id, idempotency_key, transfer_reference, transfer_date,
                reviewed_reason, amount_vnd, currency, evidence_id
            FROM manual_refund_operations WHERE idempotency_key = ? LIMIT 1`, [key]);
        const row = rows[0];
        return row ? {
            id: Number(row.id), requestId: Number(row.request_id), actorId: String(row.actor_id),
            idempotencyKey: String(row.idempotency_key), transferReference: String(row.transfer_reference),
            transferDate: dateValue(row.transfer_date), reviewedReason: String(row.reviewed_reason),
            amountVnd: parseVnd(row.amount_vnd), currency: String(row.currency) as "VND", evidenceId: Number(row.evidence_id),
        } : null;
    }

    async findOperationByReference(tx: TransactionContext, reference: string): Promise<ManualRefundOperation | null> {
        const rows = await tx.query<RawRow[]>(`SELECT id, request_id, order_payment_id, actor_id, idempotency_key, transfer_reference, transfer_date,
                reviewed_reason, amount_vnd, currency, evidence_id
            FROM manual_refund_operations WHERE transfer_reference = ? LIMIT 1`, [reference]);
        const row = rows[0];
        return row ? {
            id: Number(row.id), requestId: Number(row.request_id), actorId: String(row.actor_id),
            idempotencyKey: String(row.idempotency_key), transferReference: String(row.transfer_reference),
            transferDate: dateValue(row.transfer_date), reviewedReason: String(row.reviewed_reason),
            amountVnd: parseVnd(row.amount_vnd), currency: String(row.currency) as "VND", evidenceId: Number(row.evidence_id),
        } : null;
    }

    async insertOperation(tx: TransactionContext, input: ManualRefundInputRecord & { requestId: number; orderPaymentId: number; actorId: string }, units: RefundableAllocation[]): Promise<void> {
        const result = await tx.query<QueryResult>(`INSERT INTO manual_refund_operations
            (request_id, order_payment_id, actor_id, idempotency_key, transfer_reference, transfer_date, reviewed_reason, amount_vnd, currency, evidence_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`, [input.requestId, input.orderPaymentId, input.actorId, input.idempotencyKey,
            input.transferReference, input.transferDate, input.reviewedReason, input.amountVnd, input.currency, input.evidenceId]);
        const operationId = Number(result.insertId);
        if (!Number.isSafeInteger(operationId) || operationId < 1) throw new Error("Manual refund insert did not return an identifier");
        for (const unit of units) {
            await tx.query(`INSERT INTO manual_refund_units (operation_id, order_item_id, unit_index, net_vnd) VALUES (?, ?, ?, ?)`,
                [operationId, unit.orderItemId, unit.unitIndex, unit.netVnd]);
        }
    }

    async completeRefund(tx: TransactionContext, input: ManualRefundInputRecord & { requestId: number; orderId: number; requestReason: string; paymentId: number; actorId: string; fromStatus: string }): Promise<ManualRefundRequest> {
        const paymentUpdate = await tx.query<QueryResult>(`UPDATE order_payments
            SET status = CASE WHEN refunded_amount + ? >= amount THEN 'refunded' ELSE 'partially_refunded' END,
                refunded_amount = refunded_amount + ?,
                refunded_at = UTC_TIMESTAMP(), refund_reference = ?, updated_at = UTC_TIMESTAMP()
            WHERE id = ? AND currency = 'VND' AND refunded_amount + ? <= amount`,
        [input.amountVnd, input.amountVnd, input.transferReference, input.paymentId, input.amountVnd]);
        if (paymentUpdate.affectedRows !== 1) throw Object.assign(new Error("Refund payment ledger update failed."), { statusCode: 409 });
        await tx.query(`UPDATE after_sales_requests SET status = 'REFUNDED', refund_amount = ?, refund_currency = 'VND', refund_reference = ?,
                refunded_at = COALESCE(refunded_at, UTC_TIMESTAMP()), updated_at = UTC_TIMESTAMP() WHERE id = ?`,
        [input.amountVnd, input.transferReference, input.requestId]);
        await tx.query(`INSERT INTO after_sales_events (request_id, from_status, to_status, actor_user_id, note, created_at)
            VALUES (?, ?, 'REFUNDED', ?, ?, UTC_TIMESTAMP())`, [input.requestId, input.fromStatus, input.actorId, input.reviewedReason]);
        return {
            id: input.requestId, orderId: input.orderId, status: "REFUNDED", reason: input.requestReason, refundAmount: input.amountVnd,
            refundCurrency: "VND", refundReference: input.transferReference,
        };
    }
}
