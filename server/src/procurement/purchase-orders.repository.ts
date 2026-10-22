import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { withTransaction } from "#src/database/transaction";
import type { TransactionContext } from "#src/database/transaction";
import type { PageResult } from "./suppliers.types";
import type { CreatePurchaseOrderInput, DocumentActionInput, PurchaseOrder, PurchaseOrderLine, UpdatePurchaseOrderInput } from "./purchase-orders.types";

type QueryResult = { affectedRows?: number; insertId?: number };
type ProductRow = { id: number; sku: string | null; name: string; stock: number };
type OrderDbRow = Record<string, unknown>;
const dateText = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString() : String(value);
const safeVnd = (value: unknown): number => {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new AppError("Stored VND value is outside the supported safe range.", HTTP_STATUS.CONFLICT);
    return amount;
};
const mapLine = (row: OrderDbRow): PurchaseOrderLine => ({
    id: Number(row.item_id), productId: Number(row.product_id), sku: String(row.product_sku || ""), name: String(row.product_name || ""),
    orderedQuantity: Number(row.ordered_quantity), acceptedQuantity: Number(row.accepted_quantity), unitCostVnd: safeVnd(row.unit_cost_vnd), note: row.item_note == null ? null : String(row.item_note),
});
const mapOrder = (row: OrderDbRow, lineRows: OrderDbRow[]): PurchaseOrder => ({
    id: Number(row.id), supplierId: Number(row.supplier_id), supplierCode: row.supplier_code == null ? null : String(row.supplier_code),
    supplierName: row.supplier_name == null ? null : String(row.supplier_name), status: String(row.status) as PurchaseOrder["status"], version: Number(row.version),
    note: row.note == null ? null : String(row.note), lines: lineRows.map(mapLine), createdById: String(row.created_by_id),
    createdAt: dateText(row.created_at) || "", updatedAt: dateText(row.updated_at) || "", confirmedAt: dateText(row.confirmed_at),
    closedAt: dateText(row.closed_at), closedReason: row.closed_reason == null ? null : String(row.closed_reason),
    canceledAt: dateText(row.canceled_at), canceledReason: row.canceled_reason == null ? null : String(row.canceled_reason),
});

@Injectable()
export class PurchaseOrdersRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async lockOrder(tx: TransactionContext, id: number): Promise<OrderDbRow | null> {
        const rows = await tx.query<OrderDbRow[]>("SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE", [id]);
        return rows[0] || null;
    }

    async getDetail(id: number, tx?: TransactionContext): Promise<PurchaseOrder | null> {
        const query = <T>(sql: string, values: unknown[]): Promise<T> => tx
            ? tx.query<T>(sql, values)
            : new Promise((resolve, reject) => pool.query(sql, values, (error: Error | null, rows: T) => error ? reject(error) : resolve(rows)));
        const rows = await query<OrderDbRow[]>(
            `SELECT id, supplier_id, supplier_code, supplier_name, status, version, note, created_by_id, created_at, updated_at,
                    confirmed_at, closed_at, closed_reason, canceled_at, canceled_reason
             FROM purchase_orders WHERE id = ? LIMIT 1`, [id],
        );
        if (!rows[0]) return null;
        const lineRows = await query<OrderDbRow[]>(
            `SELECT id AS item_id, product_id, product_sku, product_name, ordered_quantity, accepted_quantity, unit_cost_vnd, note AS item_note
             FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY id ASC`, [id],
        );
        return mapOrder(rows[0], lineRows);
    }

    async list(page: number, limit: number, search: string, status: string, supplierId?: number): Promise<PageResult<PurchaseOrder>> {
        const where: string[] = [];
        const params: unknown[] = [];
        if (status !== "all") {
            where.push("po.status = ?");
            params.push(status);
        }
        if (supplierId) {
            where.push("po.supplier_id = ?");
            params.push(supplierId);
        }
        if (search) {
            const term = `%${search.replace(/[!%_]/g, "!$&")}%`;
            where.push("(CAST(po.id AS CHAR) LIKE ? ESCAPE '!' OR LOWER(COALESCE(po.supplier_name, s.name)) LIKE ? ESCAPE '!' OR LOWER(COALESCE(po.supplier_code, s.code)) LIKE ? ESCAPE '!')");
            params.push(term, term, term);
        }
        const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
        const totalRows = await new Promise<Array<{ total: number }>>((resolve, reject) => pool.query(
            `SELECT COUNT(*) AS total FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ${clause}`,
            params, (error: Error | null, rows: Array<{ total: number }>) => error ? reject(error) : resolve(rows || []),
        ));
        const total = Number(totalRows[0]?.total) || 0;
        const offset = (page - 1) * limit;
        const rows = await new Promise<OrderDbRow[]>((resolve, reject) => pool.query(
            `SELECT po.id, po.supplier_id, po.supplier_code, COALESCE(po.supplier_name, s.name) AS supplier_name,
                    po.status, po.version, po.note, po.created_by_id, po.created_at, po.updated_at, po.confirmed_at,
                    po.closed_at, po.closed_reason, po.canceled_at, po.canceled_reason
             FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id ${clause}
             ORDER BY po.created_at DESC, po.id DESC LIMIT ? OFFSET ?`,
            [...params, limit, offset], (error: Error | null, result: OrderDbRow[]) => error ? reject(error) : resolve(result || []),
        ));
        const ids = rows.map((row) => Number(row.id));
        const lineRows = ids.length ? await new Promise<OrderDbRow[]>((resolve, reject) => pool.query(
            `SELECT purchase_order_id, id AS item_id, product_id, product_sku, product_name, ordered_quantity, accepted_quantity, unit_cost_vnd, note AS item_note
             FROM purchase_order_items WHERE purchase_order_id IN (${ids.map(() => "?").join(", ")}) ORDER BY purchase_order_id, id ASC`, ids,
            (error: Error | null, result: OrderDbRow[]) => error ? reject(error) : resolve(result || []),
        )) : [];
        const linesByOrder = new Map<number, OrderDbRow[]>();
        for (const line of lineRows) {
            const orderId = Number(line.purchase_order_id);
            linesByOrder.set(orderId, [...(linesByOrder.get(orderId) || []), line]);
        }
        const items = rows.map((row) => mapOrder(row, linesByOrder.get(Number(row.id)) || []));
        return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    }

    private async validateSupplier(tx: TransactionContext, supplierId: number, activeOnly: boolean): Promise<{ id: number; code: string; name: string } | null> {
        const rows = await tx.query<Array<{ id: number; code: string; name: string; active: number }>>(
            "SELECT id, code, name, active FROM suppliers WHERE id = ? FOR UPDATE", [supplierId],
        );
        const supplier = rows[0];
        if (!supplier || (activeOnly && Number(supplier.active) !== 1)) return null;
        return { id: Number(supplier.id), code: String(supplier.code), name: String(supplier.name) };
    }

    private async validateProducts(tx: TransactionContext, input: CreatePurchaseOrderInput): Promise<Map<number, ProductRow>> {
        const ids = [...new Set(input.lines.map((line) => line.productId))].sort((a, b) => a - b);
        const rows = await tx.query<ProductRow[]>(`SELECT id, sku, name, stock FROM products WHERE id IN (${ids.map(() => "?").join(", ")}) AND stock >= 0 ORDER BY id FOR UPDATE`, ids);
        if (rows.length !== ids.length) throw new AppError("One or more products are unavailable.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
        return new Map(rows.map((row) => [Number(row.id), row]));
    }

    private async insertLines(tx: TransactionContext, orderId: number, input: CreatePurchaseOrderInput, products: Map<number, ProductRow>): Promise<void> {
        for (const line of input.lines) {
            const product = products.get(line.productId);
            if (!product) throw new AppError("A purchase order product is unavailable.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
            await tx.query(
                `INSERT INTO purchase_order_items (purchase_order_id, product_id, product_sku, product_name, ordered_quantity, accepted_quantity, unit_cost_vnd, note)
                 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
                [orderId, line.productId, product.sku || "", product.name, line.orderedQuantity, line.unitCostVnd, line.note || null],
            );
        }
    }

    private async audit(tx: TransactionContext, actorId: string, action: string, id: number, reason: string | null, changes: unknown): Promise<void> {
        await tx.query("INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes) VALUES (?, ?, 'purchase_order', ?, ?, ?)",
            [actorId, action, String(id), reason, JSON.stringify(changes)]);
    }

    async create(actorId: string, input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
        const id = await withTransaction(async (tx) => {
            const supplier = await this.validateSupplier(tx, input.supplierId, true);
            if (!supplier) throw new AppError("Choose an active supplier.", HTTP_STATUS.CONFLICT, "SUPPLIER_INACTIVE");
            const products = await this.validateProducts(tx, input);
            const result = await tx.query<QueryResult>(
                "INSERT INTO purchase_orders (supplier_id, note, created_by_id) VALUES (?, ?, ?)", [input.supplierId, input.note || null, actorId],
            );
            const orderId = Number(result.insertId);
            await this.insertLines(tx, orderId, input, products);
            await this.audit(tx, actorId, "purchase_order.created", orderId, null, { supplierId: input.supplierId, lineCount: input.lines.length });
            return orderId;
        });
        const order = await this.getDetail(id);
        if (!order) throw new AppError("Purchase order could not be loaded after creation.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return order;
    }

    async updateDraft(actorId: string, id: number, input: UpdatePurchaseOrderInput): Promise<PurchaseOrder> {
        await withTransaction(async (tx) => {
            const order = await this.lockOrder(tx, id);
            if (!order) throw new AppError("Purchase order not found.", HTTP_STATUS.NOT_FOUND);
            if (String(order.status) !== "DRAFT") throw new AppError("Only draft purchase orders can be edited.", HTTP_STATUS.CONFLICT, "INVALID_PURCHASE_ORDER_STATE");
            if (Number(order.version) !== input.version) throw new AppError("Purchase order changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            const supplier = await this.validateSupplier(tx, input.supplierId, true);
            if (!supplier) throw new AppError("Choose an active supplier.", HTTP_STATUS.CONFLICT, "SUPPLIER_INACTIVE");
            const products = await this.validateProducts(tx, input);
            await tx.query("DELETE FROM purchase_order_items WHERE purchase_order_id = ?", [id]);
            await this.insertLines(tx, id, input, products);
            await tx.query("UPDATE purchase_orders SET supplier_id = ?, note = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?",
                [input.supplierId, input.note || null, id, input.version]);
            await this.audit(tx, actorId, "purchase_order.updated", id, null, { supplierId: input.supplierId, lineCount: input.lines.length });
        });
        const order = await this.getDetail(id);
        if (!order) throw new AppError("Purchase order could not be loaded after update.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return order;
    }

    async transition(actorId: string, id: number, action: "confirm" | "cancel" | "close", input: DocumentActionInput): Promise<PurchaseOrder> {
        await withTransaction(async (tx) => {
            const order = await this.lockOrder(tx, id);
            if (!order) throw new AppError("Purchase order not found.", HTTP_STATUS.NOT_FOUND);
            const status = String(order.status);
            if (status === "CANCELED" && action === "cancel" || status === "CLOSED" && action === "close" || status === "ORDERED" && action === "confirm") return;
            if (Number(order.version) !== input.version) throw new AppError("Purchase order changed. Reload it and try again.", HTTP_STATUS.CONFLICT, "DOCUMENT_VERSION_CONFLICT");
            if (action === "confirm") {
                if (status !== "DRAFT") throw new AppError("Only draft purchase orders can be confirmed.", HTTP_STATUS.CONFLICT, "INVALID_PURCHASE_ORDER_STATE");
                const supplier = await this.validateSupplier(tx, Number(order.supplier_id), true);
                if (!supplier) throw new AppError("An archived supplier cannot be selected for a new order.", HTTP_STATUS.CONFLICT, "SUPPLIER_INACTIVE");
                const lineRows = await tx.query<Array<{ product_id: number }>>("SELECT product_id FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY product_id FOR UPDATE", [id]);
                if (!lineRows.length) throw new AppError("A purchase order needs at least one line.", HTTP_STATUS.CONFLICT);
                const ids = lineRows.map((line) => Number(line.product_id)).sort((a, b) => a - b);
                const products = await tx.query<ProductRow[]>(`SELECT id, sku, name, stock FROM products WHERE id IN (${ids.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`, ids);
                if (products.length !== ids.length || products.some((product) => Number(product.stock) < 0)) throw new AppError("A purchase order product is no longer active.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
                for (const product of products) {
                    await tx.query("UPDATE purchase_order_items SET product_sku = ?, product_name = ? WHERE purchase_order_id = ? AND product_id = ?",
                        [product.sku || "", product.name, id, product.id]);
                }
                await tx.query("UPDATE purchase_orders SET status = 'ORDERED', supplier_code = ?, supplier_name = ?, confirmed_at = UTC_TIMESTAMP(3), version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?",
                    [supplier.code, supplier.name, id, input.version]);
                await this.audit(tx, actorId, "purchase_order.confirmed", id, null, { status: { before: "DRAFT", after: "ORDERED" }, lineCount: ids.length });
            } else if (action === "cancel") {
                if (status !== "DRAFT") throw new AppError("Only draft purchase orders can be canceled.", HTTP_STATUS.CONFLICT, "INVALID_PURCHASE_ORDER_STATE");
                await tx.query("UPDATE purchase_orders SET status = 'CANCELED', canceled_at = UTC_TIMESTAMP(3), canceled_reason = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?",
                    [input.reason || null, id, input.version]);
                await this.audit(tx, actorId, "purchase_order.canceled", id, input.reason || null, { status: { before: status, after: "CANCELED" } });
            } else {
                if (status !== "ORDERED" && status !== "PARTIALLY_RECEIVED") throw new AppError("Only open confirmed purchase orders can be closed.", HTTP_STATUS.CONFLICT, "INVALID_PURCHASE_ORDER_STATE");
                await tx.query("UPDATE purchase_orders SET status = 'CLOSED', closed_at = UTC_TIMESTAMP(3), closed_reason = ?, version = version + 1, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND version = ?",
                    [input.reason || null, id, input.version]);
                const accepted = await tx.query<Array<{ product_id: number; outstanding: number }>>(
                    "SELECT product_id, ordered_quantity - accepted_quantity AS outstanding FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY product_id", [id],
                );
                await this.audit(tx, actorId, "purchase_order.closed", id, input.reason || null, { status: { before: status, after: "CLOSED" }, outstanding: accepted });
            }
        });
        const order = await this.getDetail(id);
        if (!order) throw new AppError("Purchase order could not be loaded after transition.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
        return order;
    }
}
