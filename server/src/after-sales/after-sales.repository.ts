import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { withTransaction, type TransactionContext } from "#src/database/transaction";
import type {
    AfterSalesCreateInput,
    AfterSalesItemInput,
    AfterSalesListPage,
    AfterSalesListQuery,
    AfterSalesOrderContext,
    AfterSalesOrderItem,
    AfterSalesRefundContext,
    AfterSalesRequest,
    AfterSalesStatus,
    AfterSalesStatusTransition,
    RefundConfirmationInput,
} from "./after-sales.types";
import type { PaymentProviderResult } from "../payments/payment.types";

type QueryResult<T> = { affectedRows?: number; insertId?: number } & T;
type Queryable = { query: (sql: string | { sql: string; timeout: number }, values: unknown[], callback: (error: Error | null, rows: unknown) => void) => unknown };

const query = <T>(sql: string, values: unknown[] = []): Promise<T> => new Promise((resolve, reject) => {
    (pool as unknown as Queryable).query(sql, values, (error, rows) => error ? reject(error) : resolve(rows as T));
});

const requestColumns = `r.id, r.order_id, r.user_id, r.kind, r.status, r.reason, r.admin_note,
    r.refund_amount, r.refund_currency, r.refund_reference,
    DATE_FORMAT(r.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
    DATE_FORMAT(r.updated_at, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at,
    DATE_FORMAT(r.approved_at, '%Y-%m-%dT%H:%i:%s.000Z') AS approved_at,
    DATE_FORMAT(r.received_at, '%Y-%m-%dT%H:%i:%s.000Z') AS received_at,
    DATE_FORMAT(r.refunded_at, '%Y-%m-%dT%H:%i:%s.000Z') AS refunded_at,
    DATE_FORMAT(r.closed_at, '%Y-%m-%dT%H:%i:%s.000Z') AS closed_at`;

const normalizeRequest = (row: Record<string, unknown>): AfterSalesRequest => ({
    id: Number(row.id),
    orderId: Number(row.order_id),
    userId: row.user_id ? String(row.user_id) : null,
    kind: String(row.kind) as AfterSalesRequest["kind"],
    status: String(row.status) as AfterSalesRequest["status"],
    reason: String(row.reason || ""),
    adminNote: row.admin_note ? String(row.admin_note) : null,
    refundAmount: row.refund_amount == null ? null : Number(row.refund_amount),
    refundCurrency: row.refund_currency ? String(row.refund_currency) : null,
    refundReference: row.refund_reference ? String(row.refund_reference) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    approvedAt: row.approved_at ? String(row.approved_at) : null,
    receivedAt: row.received_at ? String(row.received_at) : null,
    refundedAt: row.refunded_at ? String(row.refunded_at) : null,
    closedAt: row.closed_at ? String(row.closed_at) : null,
});

const normalizeOrder = (row: Record<string, unknown>): AfterSalesOrderContext => ({
    id: Number(row.id),
    orderStatus: Number(row.status),
    deliveredAt: row.delivered_at ? String(row.delivered_at) : null,
    warrantyMonths: null,
    currency: row.currency ? String(row.currency) : null,
    paymentMethod: row.payment_method ? String(row.payment_method) : null,
    guestEmail: row.guest_email ? String(row.guest_email) : null,
    guestName: row.guest_name ? String(row.guest_name) : null,
    guestPhone: row.guest_phone ? String(row.guest_phone) : null,
});

const normalizeItem = (row: Record<string, unknown>): AfterSalesOrderItem => ({
    id: Number(row.id),
    orderId: Number(row.order_id),
    productId: Number(row.product_id),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price || 0),
    totalPrice: Number(row.total_price || 0),
    productName: row.product_name ? String(row.product_name) : null,
    sku: row.sku ? String(row.sku) : null,
    warrantyMonths: row.warranty_months == null ? null : Number(row.warranty_months),
});

export type AfterSalesRepositoryPort = {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
    findByIdempotencyKey(tx: TransactionContext, key: string): Promise<AfterSalesRequest | null>;
    findOrderForIdentity(tx: TransactionContext, identity: { orderId: number; userId?: string; guestOrderTokenHash?: string }): Promise<AfterSalesOrderContext | null>;
    findOrderItemsForUpdate(tx: TransactionContext, orderId: number, itemIds: number[]): Promise<AfterSalesOrderItem[]>;
    getActiveRequestedQuantities(tx: TransactionContext, itemIds: number[]): Promise<Map<number, number>>;
    insertRequest(tx: TransactionContext, identity: { userId?: string; guestOrderTokenHash?: string }, input: AfterSalesCreateInput, items: AfterSalesOrderItem[]): Promise<AfterSalesRequest>;
    listCustomerRequests(userId: string, query: AfterSalesListQuery): Promise<AfterSalesListPage>;
    listGuestRequests(orderId: number, guestOrderTokenHash: string, query: AfterSalesListQuery): Promise<AfterSalesListPage>;
    listAdminRequests(query: AfterSalesListQuery): Promise<AfterSalesListPage>;
    getCustomerRequest(userId: string, id: number): Promise<AfterSalesRequest | null>;
    getGuestRequest(orderId: number, guestOrderTokenHash: string, id: number): Promise<AfterSalesRequest | null>;
    getAdminRequest(id: number): Promise<AfterSalesRequest | null>;
    getAdminRequestForUpdate(tx: TransactionContext, id: number): Promise<AfterSalesRequest | null>;
    getRefundContextForUpdate(tx: TransactionContext, id: number): Promise<AfterSalesRefundContext | null>;
    transitionRequest(tx: TransactionContext, id: number, status: AfterSalesStatusTransition, actorId: string): Promise<AfterSalesRequest | null>;
    confirmRefund(tx: TransactionContext, id: number, input: RefundConfirmationInput, actorId: string, paymentId: number, amount: number, providerResult: PaymentProviderResult): Promise<AfterSalesRequest | null>;
};

@Injectable()
export class AfterSalesRepository implements AfterSalesRepositoryPort {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
        return withTransaction(work);
    }

    async findByIdempotencyKey(tx: TransactionContext, key: string): Promise<AfterSalesRequest | null> {
        const rows = await tx.query<Record<string, unknown>[]>(`SELECT ${requestColumns}, r.guest_order_token_hash FROM after_sales_requests r WHERE r.request_idempotency_key = ? LIMIT 1 FOR UPDATE`, [key]);
        if (!rows[0]) return null;
        const request = normalizeRequest(rows[0]);
        if (rows[0].guest_order_token_hash) {
            Object.defineProperty(request, "guestOrderTokenHash", { value: String(rows[0].guest_order_token_hash), enumerable: false });
        }
        return request;
    }

    async findOrderForIdentity(tx: TransactionContext, identity: { orderId: number; userId?: string; guestOrderTokenHash?: string }): Promise<AfterSalesOrderContext | null> {
        const ownerClause = identity.userId ? "user_id = ?" : "guest_order_token_hash = ?";
        const owner = identity.userId || identity.guestOrderTokenHash;
        const rows = await tx.query<Record<string, unknown>[]>(
            `SELECT id, status, DATE_FORMAT(delivered_at, '%Y-%m-%dT%H:%i:%s.000Z') AS delivered_at,
                    currency, payment_method, guest_email, guest_name, guest_phone
             FROM orders WHERE id = ? AND ${ownerClause} LIMIT 1 FOR UPDATE`,
            [identity.orderId, owner],
        );
        return rows[0] ? normalizeOrder(rows[0]) : null;
    }

    async findOrderItemsForUpdate(tx: TransactionContext, orderId: number, itemIds: number[]): Promise<AfterSalesOrderItem[]> {
        if (!itemIds.length) return [];
        const placeholders = itemIds.map(() => "?").join(", ");
        const rows = await tx.query<Record<string, unknown>[]>(
            `SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.total_price,
                    COALESCE(oi.unit_price_snapshot, oi.total_price / NULLIF(oi.quantity, 0)) AS unit_price,
                    oi.product_name_snapshot AS product_name, oi.sku_snapshot AS sku,
                    oi.warranty_months_snapshot AS warranty_months
             FROM order_items oi
             WHERE oi.order_id = ? AND oi.id IN (${placeholders})
             ORDER BY oi.id FOR UPDATE`,
            [orderId, ...itemIds],
        );
        return rows.map(normalizeItem);
    }

    async getActiveRequestedQuantities(tx: TransactionContext, itemIds: number[]): Promise<Map<number, number>> {
        if (!itemIds.length) return new Map();
        const placeholders = itemIds.map(() => "?").join(", ");
        const rows = await tx.query<Array<{ order_item_id: number; requested_quantity: number | string }>>(
            `SELECT asi.order_item_id, SUM(asi.quantity) AS requested_quantity
             FROM after_sales_items asi
             JOIN after_sales_requests r ON r.id = asi.request_id
             WHERE asi.order_item_id IN (${placeholders}) AND r.status NOT IN ('REJECTED', 'CLOSED')
             GROUP BY asi.order_item_id`,
            itemIds,
        );
        return new Map(rows.map((row) => [Number(row.order_item_id), Number(row.requested_quantity || 0)]));
    }

    async insertRequest(tx: TransactionContext, identity: { userId?: string; guestOrderTokenHash?: string }, input: AfterSalesCreateInput, items: AfterSalesOrderItem[]): Promise<AfterSalesRequest> {
        const result = await tx.query<QueryResult<Record<string, never>>>(
            `INSERT INTO after_sales_requests
                (order_id, user_id, guest_order_token_hash, kind, status, reason, request_idempotency_key, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'REQUESTED', ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            [input.orderId, identity.userId || null, identity.guestOrderTokenHash || null, input.kind, input.reason, input.idempotencyKey],
        );
        const requestId = Number(result.insertId);
        if (!requestId) throw new Error("After-sales request was not created");
        for (const item of input.items) {
            await tx.query(
                `INSERT INTO after_sales_items (request_id, order_item_id, quantity, reason, created_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP())`,
                [requestId, item.orderItemId, item.quantity, item.reason || null],
            );
        }
        const paymentUpdate = await tx.query<{ affectedRows?: number }>(
            `INSERT INTO after_sales_events (request_id, from_status, to_status, actor_user_id, note, created_at)
             VALUES (?, NULL, 'REQUESTED', ?, ?, UTC_TIMESTAMP())`,
            [requestId, identity.userId || null, input.reason],
        );
        const row = await tx.query<Record<string, unknown>[]>(`SELECT ${requestColumns} FROM after_sales_requests r WHERE r.id = ? LIMIT 1`, [requestId]);
        const request = row[0] ? normalizeRequest(row[0]) : null;
        if (!request) throw new Error("After-sales request was not created");
        request.items = input.items.map((requested) => {
            const source = items.find((item) => item.id === requested.orderItemId);
            return { ...requested, id: requested.orderItemId, productName: source?.productName, unitPrice: source?.unitPrice };
        });
        return request;
    }

    private async listRequests(where: string, values: unknown[], queryInput: AfterSalesListQuery): Promise<AfterSalesListPage> {
        const filterValues = [...values];
        const filters: string[] = [];
        if (queryInput.status) { filters.push("r.status = ?"); filterValues.push(queryInput.status); }
        if (queryInput.kind) { filters.push("r.kind = ?"); filterValues.push(queryInput.kind); }
        const clause = [where, ...filters].filter(Boolean).join(" AND ");
        const page = Math.max(1, queryInput.page);
        const limit = Math.min(100, Math.max(1, queryInput.limit));
        const countRows = await query<Array<{ total: number | string }>>(`SELECT COUNT(*) AS total FROM after_sales_requests r WHERE ${clause}`, filterValues);
        const total = Number(countRows[0]?.total || 0);
        const rows = await query<Record<string, unknown>[]>(
            `SELECT ${requestColumns} FROM after_sales_requests r WHERE ${clause} ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`,
            [...filterValues, limit, (page - 1) * limit],
        );
        return { requests: rows.map(normalizeRequest), pagination: { page, limit, total, totalPages: total ? Math.ceil(total / limit) : 0 } };
    }

    listCustomerRequests(userId: string, queryInput: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.listRequests("r.user_id = ?", [userId], queryInput);
    }

    listGuestRequests(orderId: number, guestOrderTokenHash: string, queryInput: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.listRequests("r.order_id = ? AND r.guest_order_token_hash = ?", [orderId, guestOrderTokenHash], queryInput);
    }

    listAdminRequests(queryInput: AfterSalesListQuery): Promise<AfterSalesListPage> {
        return this.listRequests("1 = 1", [], queryInput);
    }

    private async getRequest(where: string, values: unknown[]): Promise<AfterSalesRequest | null> {
        const rows = await query<Record<string, unknown>[]>(`SELECT ${requestColumns} FROM after_sales_requests r WHERE ${where} LIMIT 1`, values);
        if (!rows[0]) return null;
        const request = normalizeRequest(rows[0]);
        const itemRows = await query<Record<string, unknown>[]>(
            `SELECT asi.id, asi.order_item_id, asi.quantity, asi.reason, oi.product_name_snapshot AS product_name,
                    COALESCE(oi.unit_price_snapshot, oi.total_price / NULLIF(oi.quantity, 0)) AS unit_price
             FROM after_sales_items asi JOIN order_items oi ON oi.id = asi.order_item_id
             WHERE asi.request_id = ? ORDER BY asi.id`, [request.id],
        );
        request.items = itemRows.map((row) => ({ id: Number(row.id), orderItemId: Number(row.order_item_id), quantity: Number(row.quantity), reason: row.reason ? String(row.reason) : undefined, productName: row.product_name ? String(row.product_name) : null, unitPrice: Number(row.unit_price || 0) }));
        const eventRows = await query<Record<string, unknown>[]>(
            `SELECT id, from_status, to_status, actor_user_id, note, DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
             FROM after_sales_events WHERE request_id = ? ORDER BY created_at ASC, id ASC`, [request.id],
        );
        request.events = eventRows.map((row) => ({ id: Number(row.id), fromStatus: row.from_status ? String(row.from_status) as AfterSalesStatus : null, toStatus: String(row.to_status) as AfterSalesStatus, actorUserId: row.actor_user_id ? String(row.actor_user_id) : null, note: row.note ? String(row.note) : null, createdAt: String(row.created_at) }));
        return request;
    }

    getCustomerRequest(userId: string, id: number): Promise<AfterSalesRequest | null> {
        return this.getRequest("r.id = ? AND r.user_id = ?", [id, userId]);
    }

    getGuestRequest(orderId: number, guestOrderTokenHash: string, id: number): Promise<AfterSalesRequest | null> {
        return this.getRequest("r.id = ? AND r.order_id = ? AND r.guest_order_token_hash = ?", [id, orderId, guestOrderTokenHash]);
    }

    getAdminRequest(id: number): Promise<AfterSalesRequest | null> {
        return this.getRequest("r.id = ?", [id]);
    }

    async getAdminRequestForUpdate(tx: TransactionContext, id: number): Promise<AfterSalesRequest | null> {
        const rows = await tx.query<Record<string, unknown>[]>(
            `SELECT ${requestColumns} FROM after_sales_requests r WHERE r.id = ? LIMIT 1 FOR UPDATE`,
            [id],
        );
        return rows[0] ? normalizeRequest(rows[0]) : null;
    }

    async getRefundContextForUpdate(tx: TransactionContext, id: number): Promise<AfterSalesRefundContext | null> {
        const request = await this.getAdminRequestForUpdate(tx, id);
        if (!request) return null;
        const paymentRows = await tx.query<Record<string, unknown>[]>(
            `SELECT id, order_id, provider, status, provider_payment_id, provider_reference,
                    amount, COALESCE(refunded_amount, 0) AS refunded_amount, currency
             FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
            [request.orderId],
        );
        const amountRows = await tx.query<Array<{ requested_amount: number | string | null }>>(
            `SELECT COALESCE(SUM(asi.quantity * COALESCE(oi.unit_price_snapshot, oi.total_price / NULLIF(oi.quantity, 0))), 0) AS requested_amount
             FROM after_sales_items asi
             JOIN order_items oi ON oi.id = asi.order_item_id
             WHERE asi.request_id = ?`,
            [id],
        );
        const payment = paymentRows[0];
        return {
            request,
            requestedAmount: Number(amountRows[0]?.requested_amount || 0),
            payment: payment ? {
                id: Number(payment.id),
                orderId: Number(payment.order_id),
                provider: String(payment.provider),
                status: String(payment.status),
                providerPaymentId: payment.provider_payment_id ? String(payment.provider_payment_id) : null,
                providerReference: payment.provider_reference ? String(payment.provider_reference) : null,
                amount: Number(payment.amount || 0),
                refundedAmount: Number(payment.refunded_amount || 0),
                currency: String(payment.currency || "").toUpperCase(),
            } : null,
        };
    }

    async transitionRequest(tx: TransactionContext, id: number, transition: AfterSalesStatusTransition, actorId: string): Promise<AfterSalesRequest | null> {
        const current = await this.getAdminRequestForUpdate(tx, id);
        if (!current) return null;
        const timestampColumn = transition.status === "APPROVED" ? "approved_at" : transition.status === "RECEIVED" ? "received_at" : transition.status === "CLOSED" ? "closed_at" : null;
        const timestampUpdate = timestampColumn ? `, ${timestampColumn} = COALESCE(${timestampColumn}, UTC_TIMESTAMP())` : "";
        await tx.query(`UPDATE after_sales_requests SET status = ?, admin_note = COALESCE(?, admin_note), updated_at = UTC_TIMESTAMP()${timestampUpdate} WHERE id = ?`, [transition.status, transition.note || null, id]);
        await tx.query(`INSERT INTO after_sales_events (request_id, from_status, to_status, actor_user_id, note, created_at) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`, [id, current.status, transition.status, actorId, transition.note || null]);
        const updated = await tx.query<Record<string, unknown>[]>(`SELECT ${requestColumns} FROM after_sales_requests r WHERE r.id = ? LIMIT 1`, [id]);
        return updated[0] ? normalizeRequest(updated[0]) : null;
    }

    async confirmRefund(tx: TransactionContext, id: number, input: RefundConfirmationInput, actorId: string, paymentId: number, amount: number, providerResult: PaymentProviderResult): Promise<AfterSalesRequest | null> {
        const current = await this.getAdminRequestForUpdate(tx, id);
        if (!current) return null;
        const providerRefundReference = providerResult.refundReference || input.refundReference;
        await tx.query(
            `UPDATE after_sales_requests
             SET status = 'REFUNDED', refund_amount = ?, refund_reference = ?, refund_currency = ?, refunded_at = COALESCE(refunded_at, UTC_TIMESTAMP()),
                 admin_note = COALESCE(?, admin_note), updated_at = UTC_TIMESTAMP()
             WHERE id = ?`,
            [amount, input.refundReference, input.currency, input.note || null, id],
        );
        const paymentUpdate = await tx.query<{ affectedRows?: number }>(
            `UPDATE order_payments
             SET status = CASE WHEN refunded_amount + ? >= amount THEN 'refunded' ELSE 'partially_refunded' END,
                 refunded_amount = refunded_amount + ?, refunded_at = UTC_TIMESTAMP(), refund_reference = ?,
                 provider_status = 'REFUNDED', updated_at = UTC_TIMESTAMP()
             WHERE id = ? AND refunded_amount + ? <= amount`,
            [amount, amount, providerRefundReference, paymentId, amount],
        );
        if (paymentUpdate.affectedRows !== 1) throw new Error("Refund payment ledger update failed");
        await tx.query(`INSERT INTO after_sales_events (request_id, from_status, to_status, actor_user_id, note, created_at) VALUES (?, ?, 'REFUNDED', ?, ?, UTC_TIMESTAMP())`, [id, current.status, actorId, input.note || input.refundReference]);
        const updated = await tx.query<Record<string, unknown>[]>(`SELECT ${requestColumns} FROM after_sales_requests r WHERE r.id = ? LIMIT 1`, [id]);
        return updated[0] ? normalizeRequest(updated[0]) : null;
    }
}
