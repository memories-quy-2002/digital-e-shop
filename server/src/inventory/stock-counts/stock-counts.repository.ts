import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { withTransaction } from "#src/database/transaction";
import type { TransactionContext } from "#src/database/transaction";
import type { ProductSnapshot } from "../../product-alerts/product-alerts.types";
import type { StockCount, StockCountItem, StockCountPage, StockCountQuery } from "./stock-counts.types";

type QueryResult = { affectedRows?: number; insertId?: number };
type DbRow = Record<string, unknown>;
type ProductRow = ProductSnapshot & { id: number; sku: string | null; name: string; stockRevision: string; active: boolean };
const dateText = (value: unknown): string | null => value == null ? null : value instanceof Date ? value.toISOString() : String(value);
const mapItem = (row: DbRow): StockCountItem => ({
    id: Number(row.item_id ?? row.id), productId: Number(row.product_id), sku: String(row.sku || ""), productName: String(row.product_name || ""),
    baselineStock: Number(row.baseline_stock), baselineRevision: String(row.baseline_revision),
    countedQuantity: row.counted_quantity == null ? null : Number(row.counted_quantity), reason: row.reason == null ? null : String(row.reason),
    difference: row.counted_quantity == null ? null : Number(row.counted_quantity) - Number(row.baseline_stock),
    activeReservedQuantity: Number(row.active_reserved_quantity) || 0,
});
const mapHeader = (row: DbRow, items: StockCountItem[]): StockCount => ({
    id: Number(row.id), status: String(row.status) as StockCount["status"], version: Number(row.version), note: row.note == null ? null : String(row.note), items,
    createdById: String(row.created_by_id), submittedById: row.submitted_by_id == null ? null : String(row.submitted_by_id),
    approvedById: row.approved_by_id == null ? null : String(row.approved_by_id), canceledById: row.canceled_by_id == null ? null : String(row.canceled_by_id),
    canceledReason: row.canceled_reason == null ? null : String(row.canceled_reason), createdAt: dateText(row.created_at) || "", updatedAt: dateText(row.updated_at) || "",
    submittedAt: dateText(row.submitted_at), approvedAt: dateText(row.approved_at), canceledAt: dateText(row.canceled_at),
});

@Injectable()
export class StockCountsRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async get(id: number, tx?: TransactionContext): Promise<StockCount | null> {
        const query = <T>(sql: string, params: unknown[]) => tx
            ? tx.query<T>(sql, params)
            : new Promise<T>((resolve, reject) => pool.query(sql, params, (error: Error | null, rows: T) => error ? reject(error) : resolve(rows)));
        const headers = await query<DbRow[]>("SELECT * FROM stock_counts WHERE id = ? LIMIT 1", [id]);
        if (!headers[0]) return null;
        const lines = await query<DbRow[]>(
            `SELECT sci.id AS item_id, sci.product_id, sci.sku, sci.product_name, sci.baseline_stock,
                    CAST(sci.baseline_revision AS CHAR) AS baseline_revision, sci.counted_quantity, sci.reason,
                    COALESCE((SELECT SUM(ir.quantity) FROM inventory_reservations ir
                              JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                              WHERE ir.product_id = sci.product_id AND pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()), 0) AS active_reserved_quantity
             FROM stock_count_items sci WHERE sci.stock_count_id = ? ORDER BY sci.product_id ASC`, [id],
        );
        return mapHeader(headers[0], lines.map(mapItem));
    }

    async list(query: StockCountQuery): Promise<StockCountPage> {
        const conditions: string[] = [];
        const params: unknown[] = [];
        if (query.status && query.status !== "all") {
            conditions.push("sc.status = ?");
            params.push(query.status);
        }
        if (query.search) {
            const term = `%${query.search.replace(/[!%_]/g, "!$&")}%`;
            conditions.push("(CAST(sc.id AS CHAR) LIKE ? ESCAPE '!' OR EXISTS (SELECT 1 FROM stock_count_items sci WHERE sci.stock_count_id = sc.id AND (LOWER(sci.sku) LIKE ? ESCAPE '!' OR LOWER(sci.product_name) LIKE ? ESCAPE '!'))) ");
            params.push(term, term, term);
        }
        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
        const countRows = await new Promise<Array<{ total: number }>>((resolve, reject) => pool.query(`SELECT COUNT(*) AS total FROM stock_counts sc ${where}`, params,
            (error: Error | null, rows: Array<{ total: number }>) => error ? reject(error) : resolve(rows || [])));
        const total = Number(countRows[0]?.total) || 0;
        const offset = (query.page - 1) * query.limit;
        const headers = await new Promise<DbRow[]>((resolve, reject) => pool.query(
            `SELECT sc.* FROM stock_counts sc ${where} ORDER BY sc.updated_at DESC, sc.id DESC LIMIT ? OFFSET ?`, [...params, query.limit, offset],
            (error: Error | null, rows: DbRow[]) => error ? reject(error) : resolve(rows || []),
        ));
        const ids = headers.map((header) => Number(header.id));
        const lines = ids.length ? await new Promise<DbRow[]>((resolve, reject) => pool.query(
            `SELECT sci.stock_count_id, sci.id AS item_id, sci.product_id, sci.sku, sci.product_name, sci.baseline_stock,
                    CAST(sci.baseline_revision AS CHAR) AS baseline_revision, sci.counted_quantity, sci.reason,
                    COALESCE((SELECT SUM(ir.quantity) FROM inventory_reservations ir
                              JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                              WHERE ir.product_id = sci.product_id AND pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()), 0) AS active_reserved_quantity
             FROM stock_count_items sci WHERE sci.stock_count_id IN (${ids.map(() => "?").join(", ")}) ORDER BY sci.stock_count_id, sci.product_id`, ids,
            (error: Error | null, rows: DbRow[]) => error ? reject(error) : resolve(rows || []),
        )) : [];
        const linesByCount = new Map<number, StockCountItem[]>();
        for (const row of lines) {
            const countId = Number(row.stock_count_id);
            linesByCount.set(countId, [...(linesByCount.get(countId) || []), mapItem(row)]);
        }
        return {
            items: headers.map((header) => mapHeader(header, linesByCount.get(Number(header.id)) || [])),
            pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
        };
    }

    async lockHeader(tx: TransactionContext, id: number): Promise<DbRow | null> {
        const rows = await tx.query<DbRow[]>("SELECT * FROM stock_counts WHERE id = ? FOR UPDATE", [id]);
        return rows[0] || null;
    }

    async lockItems(tx: TransactionContext, id: number): Promise<StockCountItem[]> {
        const rows = await tx.query<DbRow[]>(
            `SELECT sci.id AS item_id, sci.product_id, sci.sku, sci.product_name, sci.baseline_stock,
                    CAST(sci.baseline_revision AS CHAR) AS baseline_revision, sci.counted_quantity, sci.reason
             FROM stock_count_items sci WHERE sci.stock_count_id = ? ORDER BY sci.product_id ASC FOR UPDATE`, [id],
        );
        return rows.map(mapItem);
    }

    async lockProducts(tx: TransactionContext, ids: number[]): Promise<ProductRow[]> {
        const sorted = [...new Set(ids)].sort((a, b) => a - b);
        if (!sorted.length) return [];
        const rows = await tx.query<DbRow[]>(
            `SELECT id, sku, name, price, sale_price, stock, CAST(stock_revision AS CHAR) AS stock_revision
             FROM products WHERE id IN (${sorted.map(() => "?").join(", ")}) ORDER BY id FOR UPDATE`, sorted,
        );
        return rows.map((row) => ({ id: Number(row.id), productId: Number(row.id), sku: row.sku == null ? null : String(row.sku), name: String(row.name),
            price: Number(row.price), salePrice: row.sale_price == null ? null : Number(row.sale_price), stock: Number(row.stock), stockRevision: String(row.stock_revision), active: Number(row.stock) >= 0 }));
    }

    async activeReservations(tx: TransactionContext, productIds: number[]): Promise<Map<number, number>> {
        const ids = [...new Set(productIds)].sort((a, b) => a - b);
        if (!ids.length) return new Map();
        const rows = await tx.query<Array<{ product_id: number; quantity: number }>>(
            `SELECT ir.product_id, SUM(ir.quantity) AS quantity
             FROM inventory_reservations ir
             JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
             WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP() AND ir.product_id IN (${ids.map(() => "?").join(", ")})
             GROUP BY ir.product_id`, ids,
        );
        return new Map(rows.map((row) => [Number(row.product_id), Number(row.quantity)]));
    }

    async create(tx: TransactionContext, actorId: string, note: string | undefined, products: ProductRow[]): Promise<number> {
        const header = await tx.query<QueryResult>("INSERT INTO stock_counts (note, created_by_id) VALUES (?, ?)", [note || null, actorId]);
        const id = Number(header.insertId);
        if (!Number.isSafeInteger(id) || id < 1) throw new Error("Stock count insert did not return an identifier.");
        for (const product of products) {
            if (!product.active) throw new AppError("Inactive products cannot be added to a stock count.", HTTP_STATUS.CONFLICT, "PRODUCT_UNAVAILABLE");
            await tx.query(
                `INSERT INTO stock_count_items (stock_count_id, product_id, sku, product_name, baseline_stock, baseline_revision)
                 VALUES (?, ?, ?, ?, ?, ?)`, [id, product.productId, product.sku || "", product.name, product.stock, product.stockRevision],
            );
        }
        await this.audit(tx, actorId, "stock_count.created", id, null, { productCount: products.length });
        return id;
    }

    async saveObservations(tx: TransactionContext, countId: number, observations: Array<{ itemId: number; countedQuantity: number; reason?: string }>): Promise<void> {
        const rows = await this.lockItems(tx, countId);
        const byId = new Map(rows.map((row) => [row.id, row]));
        for (const observation of observations) {
            const item = byId.get(observation.itemId);
            if (!item) throw new AppError("One or more count lines do not belong to this session.", HTTP_STATUS.BAD_REQUEST);
            if (observation.countedQuantity !== item.baselineStock && !observation.reason?.trim()) throw new AppError("Add a reason for every stock difference.", HTTP_STATUS.BAD_REQUEST);
            await tx.query("UPDATE stock_count_items SET counted_quantity = ?, reason = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND stock_count_id = ?",
                [observation.countedQuantity, observation.reason?.trim() || null, observation.itemId, countId]);
        }
    }

    async writeCountedStock(tx: TransactionContext, item: StockCountItem, current: ProductRow): Promise<void> {
        const next = item.countedQuantity;
        if (next === null) throw new AppError("Stock count is incomplete.", HTTP_STATUS.CONFLICT);
        if (next === current.stock) return;
        const result = await tx.query<QueryResult>(
            `UPDATE products SET stock = ?, stock_revision = stock_revision + 1
             WHERE id = ? AND stock_revision = ? AND stock >= 0`, [next, current.productId, current.stockRevision],
        );
        if (result.affectedRows !== 1) throw new AppError("Product stock changed during count approval.", HTTP_STATUS.CONFLICT, "STOCK_COUNT_CONFLICT");
    }

    async reopenItems(tx: TransactionContext, countId: number, items: StockCountItem[], products: ProductRow[], selected: number[], actorId: string, reason: string): Promise<void> {
        const productById = new Map(products.map((product) => [product.productId, product]));
        const itemById = new Map(items.map((item) => [item.id, item]));
        for (const itemId of selected) {
            const item = itemById.get(itemId);
            const product = item ? productById.get(item.productId) : undefined;
            if (!item || !product || !product.active) throw new AppError("A selected count line or active product could not be found.", HTTP_STATUS.CONFLICT);
            await tx.query(
                `UPDATE stock_count_items SET baseline_stock = ?, baseline_revision = ?, counted_quantity = NULL, reason = NULL, updated_at = UTC_TIMESTAMP(3)
                 WHERE id = ? AND stock_count_id = ?`, [product.stock, product.stockRevision, item.id, countId],
            );
        }
        await this.audit(tx, actorId, "stock_count.reopened", countId, reason,
            { refreshedItems: selected.map((id) => ({ itemId: id, previousBaseline: itemById.get(id)?.baselineStock, newBaseline: productById.get(itemById.get(id)?.productId || -1)?.stock })) });
    }

    async audit(tx: TransactionContext, actorId: string, action: string, countId: number, reason: string | null, changes: unknown): Promise<void> {
        await tx.query("INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes) VALUES (?, ?, 'stock_count', ?, ?, ?)",
            [actorId, action, String(countId), reason, JSON.stringify(changes)]);
    }

    async countById(tx: TransactionContext, id: number): Promise<StockCount> {
        const result = await this.get(id, tx);
        if (!result) throw new AppError("Stock count not found.", HTTP_STATUS.NOT_FOUND);
        return result;
    }
}
