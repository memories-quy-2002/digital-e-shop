import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { withTransaction } from "#src/database/transaction";
import type { TransactionContext } from "#src/database/transaction";
import type { ProductSnapshot } from "../product-alerts/product-alerts.types";
import type { PageResult } from "./suppliers.types";
import type { PurchaseReceipt, ReceiptLineRow } from "./purchase-receipts.types";
import type { PurchaseOrderStatus } from "./purchase-orders.types";

type QueryResult = { affectedRows?: number; insertId?: number };
type DbRow = Record<string, unknown>;
export type ReceiptPostingLine = {
    id: number; productId: number; sku: string; productName: string; orderedQuantity: number; acceptedQuantity: number; plannedUnitCostVnd: number;
};
export type ReceiptPostingOrder = { id: number; status: PurchaseOrderStatus; version: number; supplierId: number; lines: ReceiptPostingLine[] };
export type ReceiptStockRow = ProductSnapshot & { sku: string | null; name: string; stockRevision: string };

const safeVnd = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AppError("Stored VND amount is outside the supported safe range.", HTTP_STATUS.CONFLICT);
    return parsed;
};
const dateText = (value: unknown): string => value instanceof Date ? value.toISOString() : String(value ?? "");
const mapReceipt = (row: DbRow, lineRows: ReceiptLineRow[]): PurchaseReceipt => ({
    id: Number(row.id), purchaseOrderId: Number(row.purchase_order_id), idempotencyKey: String(row.idempotency_key), actorId: String(row.actor_id),
    note: row.note == null ? null : String(row.note), totalAcceptedCostVnd: safeVnd(row.total_accepted_cost_vnd), createdAt: dateText(row.created_at),
    lines: lineRows.map((line) => ({
        id: Number(line.id), purchaseOrderItemId: Number(line.purchase_order_item_id), productId: Number(line.product_id), sku: line.sku,
        productName: line.product_name, expectedQuantity: Number(line.expected_quantity), acceptedQuantity: Number(line.accepted_quantity),
        rejectedQuantity: Number(line.rejected_quantity), missingQuantity: Number(line.missing_quantity), plannedUnitCostVnd: safeVnd(line.planned_unit_cost_vnd),
        unitCostVnd: safeVnd(line.unit_cost_vnd), actualCostReason: line.actual_cost_reason, note: line.note,
    })),
});

@Injectable()
export class PurchaseReceiptsRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async existsOrder(orderId: number): Promise<boolean> {
        const rows = await new Promise<Array<{ id: number }>>((resolve, reject) => pool.query(
            "SELECT id FROM purchase_orders WHERE id = ? LIMIT 1", [orderId],
            (error: Error | null, result: Array<{ id: number }>) => error ? reject(error) : resolve(result || []),
        ));
        return rows.length > 0;
    }

    getReceipt(receiptId: number): Promise<PurchaseReceipt | null> {
        return this.withTransaction((tx) => this.getReceiptById(tx, receiptId));
    }

    async lockPurchaseOrder(tx: TransactionContext, orderId: number): Promise<ReceiptPostingOrder | null> {
        const orders = await tx.query<DbRow[]>("SELECT id, supplier_id, status, version FROM purchase_orders WHERE id = ? FOR UPDATE", [orderId]);
        if (!orders[0]) return null;
        const lines = await tx.query<DbRow[]>(
            `SELECT id, product_id, product_sku, product_name, ordered_quantity, accepted_quantity, unit_cost_vnd
             FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY product_id ASC FOR UPDATE`, [orderId],
        );
        return {
            id: Number(orders[0].id), supplierId: Number(orders[0].supplier_id), status: String(orders[0].status) as PurchaseOrderStatus, version: Number(orders[0].version),
            lines: lines.map((line) => ({ id: Number(line.id), productId: Number(line.product_id), sku: String(line.product_sku || ""), productName: String(line.product_name || ""), orderedQuantity: Number(line.ordered_quantity), acceptedQuantity: Number(line.accepted_quantity), plannedUnitCostVnd: safeVnd(line.unit_cost_vnd) })),
        };
    }

    async findByIdempotencyKey(tx: TransactionContext, orderId: number, key: string): Promise<{ receipt: PurchaseReceipt; payloadHash: string; actorId: string } | null> {
        const rows = await tx.query<DbRow[]>("SELECT * FROM purchase_receipts WHERE purchase_order_id = ? AND idempotency_key = ? LIMIT 1", [orderId, key]);
        if (!rows[0]) return null;
        const lines = await this.getReceiptLines(tx, [Number(rows[0].id)]);
        return { receipt: mapReceipt(rows[0], lines.get(Number(rows[0].id)) || []), payloadHash: String(rows[0].payload_hash), actorId: String(rows[0].actor_id) };
    }

    async getStockRowsForUpdate(tx: TransactionContext, productIds: number[]): Promise<ReceiptStockRow[]> {
        const ids = [...new Set(productIds)].sort((a, b) => a - b);
        if (!ids.length) return [];
        const rows = await tx.query<DbRow[]>(
            `SELECT id, sku, name, price, sale_price, stock, CAST(stock_revision AS CHAR) AS stock_revision
             FROM products WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`, ids,
        );
        return rows.map((row) => ({ productId: Number(row.id), sku: row.sku == null ? null : String(row.sku), name: String(row.name),
            price: Number(row.price), salePrice: row.sale_price == null ? null : Number(row.sale_price), stock: Number(row.stock), stockRevision: String(row.stock_revision) }));
    }

    async createReceipt(tx: TransactionContext, input: { orderId: number; key: string; payloadHash: string; actorId: string; note?: string; totalCost: number }): Promise<number> {
        const result = await tx.query<QueryResult>(
            `INSERT INTO purchase_receipts (purchase_order_id, idempotency_key, payload_hash, actor_id, note, total_accepted_cost_vnd)
             VALUES (?, ?, ?, ?, ?, ?)`, [input.orderId, input.key, input.payloadHash, input.actorId, input.note || null, input.totalCost],
        );
        const id = Number(result.insertId);
        if (!Number.isSafeInteger(id) || id < 1) throw new Error("Receipt insert did not return an identifier.");
        return id;
    }

    async addStock(tx: TransactionContext, row: ReceiptStockRow, quantity: number): Promise<number> {
        if (!quantity) return row.stock;
        const result = await tx.query<QueryResult>(
            `UPDATE products SET stock = stock + ?, stock_revision = stock_revision + 1
             WHERE id = ? AND stock >= 0 AND stock <= ?`, [quantity, row.productId, 2_147_483_647 - quantity],
        );
        if (result.affectedRows !== 1) throw new AppError("Product stock changed or exceeds the supported stock range.", HTTP_STATUS.CONFLICT, "STOCK_UPDATE_CONFLICT");
        return row.stock + quantity;
    }

    async createReceiptLines(tx: TransactionContext, receiptId: number, lines: Array<{
        purchaseOrderItemId: number; productId: number; sku: string; productName: string; expectedQuantity: number; acceptedQuantity: number;
        rejectedQuantity: number; missingQuantity: number; plannedUnitCostVnd: number; unitCostVnd: number; actualCostReason?: string; note?: string;
    }>): Promise<Array<{ lineId: number; input: (typeof lines)[number] }>> {
        const created = [] as Array<{ lineId: number; input: (typeof lines)[number] }>;
        for (const line of lines) {
            const result = await tx.query<QueryResult>(
                `INSERT INTO purchase_receipt_lines
                    (purchase_receipt_id, purchase_order_item_id, product_id, sku, product_name, expected_quantity, accepted_quantity, rejected_quantity, missing_quantity,
                     planned_unit_cost_vnd, unit_cost_vnd, actual_cost_reason, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [receiptId, line.purchaseOrderItemId, line.productId, line.sku, line.productName, line.expectedQuantity, line.acceptedQuantity,
                    line.rejectedQuantity, line.missingQuantity, line.plannedUnitCostVnd, line.unitCostVnd,
                    line.actualCostReason || null, line.note || null],
            );
            const lineId = Number(result.insertId);
            if (!Number.isSafeInteger(lineId) || lineId < 1) throw new Error("Receipt line insert did not return an identifier.");
            created.push({ lineId, input: line });
        }
        return created;
    }

    async updateOrderProgress(tx: TransactionContext, orderId: number, version: number): Promise<void> {
        const rows = await tx.query<Array<{ total_lines: number; received_lines: number; accepted_total: number }>>(
            `SELECT COUNT(*) AS total_lines, SUM(accepted_quantity >= ordered_quantity) AS received_lines, SUM(accepted_quantity) AS accepted_total
             FROM purchase_order_items WHERE purchase_order_id = ?`, [orderId],
        );
        const row = rows[0];
        const status = row && Number(row.received_lines) === Number(row.total_lines) ? "RECEIVED" : Number(row?.accepted_total || 0) > 0 ? "PARTIALLY_RECEIVED" : "ORDERED";
        const result = await tx.query<QueryResult>(
            "UPDATE purchase_orders SET status = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ? AND status IN ('ORDERED','PARTIALLY_RECEIVED')",
            [status, orderId, version],
        );
        if (result.affectedRows !== 1) throw new AppError("Purchase order changed while recording receipt.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
    }

    async audit(tx: TransactionContext, actorId: string, receiptId: number, orderId: number, changes: unknown): Promise<void> {
        await tx.query("INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, changes) VALUES (?, 'purchase_receipt.posted', 'purchase_receipt', ?, ?)",
            [actorId, String(receiptId), JSON.stringify({ purchaseOrderId: orderId, ...changes as Record<string, unknown> })]);
    }

    private async getReceiptLines(tx: TransactionContext, receiptIds: number[]): Promise<Map<number, ReceiptLineRow[]>> {
        if (!receiptIds.length) return new Map();
        const rows = await tx.query<ReceiptLineRow[]>(
            `SELECT id, purchase_receipt_id, purchase_order_item_id, product_id, sku, product_name, expected_quantity, accepted_quantity,
                    rejected_quantity, missing_quantity, planned_unit_cost_vnd, unit_cost_vnd, actual_cost_reason, note
             FROM purchase_receipt_lines WHERE purchase_receipt_id IN (${receiptIds.map(() => "?").join(", ")}) ORDER BY id`, receiptIds,
        );
        const grouped = new Map<number, ReceiptLineRow[]>();
        for (const row of rows as Array<ReceiptLineRow & { purchase_receipt_id: number }>) {
            const list = grouped.get(Number(row.purchase_receipt_id)) || [];
            list.push(row);
            grouped.set(Number(row.purchase_receipt_id), list);
        }
        return grouped;
    }

    async getReceiptById(tx: TransactionContext, receiptId: number): Promise<PurchaseReceipt | null> {
        const rows = await tx.query<DbRow[]>("SELECT * FROM purchase_receipts WHERE id = ? LIMIT 1", [receiptId]);
        if (!rows[0]) return null;
        const lines = await this.getReceiptLines(tx, [receiptId]);
        return mapReceipt(rows[0], lines.get(receiptId) || []);
    }

    async list(orderId: number, page: number, limit: number): Promise<PageResult<PurchaseReceipt>> {
        const query = <T>(sql: string, values: unknown[]): Promise<T> => new Promise((resolve, reject) => pool.query(sql, values, (error: Error | null, rows: T) => error ? reject(error) : resolve(rows)));
        const countRows = await query<Array<{ total: number }>>("SELECT COUNT(*) AS total FROM purchase_receipts WHERE purchase_order_id = ?", [orderId]);
        const total = Number(countRows[0]?.total) || 0;
        const offset = (page - 1) * limit;
        const headers = await query<DbRow[]>("SELECT * FROM purchase_receipts WHERE purchase_order_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", [orderId, limit, offset]);
        const ids = headers.map((row) => Number(row.id));
        const lines = ids.length ? await new Promise<ReceiptLineRow[]>((resolve, reject) => pool.query(
            `SELECT id, purchase_receipt_id, purchase_order_item_id, product_id, sku, product_name, expected_quantity, accepted_quantity, rejected_quantity,
                    missing_quantity, planned_unit_cost_vnd, unit_cost_vnd, actual_cost_reason, note
             FROM purchase_receipt_lines WHERE purchase_receipt_id IN (${ids.map(() => "?").join(", ")}) ORDER BY id`, ids,
            (error: Error | null, rows: ReceiptLineRow[]) => error ? reject(error) : resolve(rows || []),
        )) : [];
        const grouped = new Map<number, ReceiptLineRow[]>();
        for (const row of lines as Array<ReceiptLineRow & { purchase_receipt_id: number }>) {
            const key = Number(row.purchase_receipt_id);
            grouped.set(key, [...(grouped.get(key) || []), row]);
        }
        return { items: headers.map((row) => mapReceipt(row, grouped.get(Number(row.id)) || [])), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }
}
