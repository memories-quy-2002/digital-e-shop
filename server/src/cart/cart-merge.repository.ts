import { Injectable, NotFoundException } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "#src/database/transaction";
import { CHECKOUT_RESERVATION_STATUS } from "#src/shared/constants/checkout-reservation";

export type CartMergeResult = {
    accepted: Array<{ productId: number; quantity: number }>;
    rejected: Array<{ productId: number; quantity: number; reason: "unavailable" | "insufficient_stock" }>;
};
export type CartMergeOperation = { payloadHash: string; resultJson: string | CartMergeResult };

@Injectable()
export class CartMergeRepository {
    withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> { return withTransaction(work); }

    async lockUser(tx: TransactionContext, userId: string): Promise<void> {
        const [row] = await tx.query<Array<{ id: string }>>("SELECT id FROM users WHERE id = ? FOR UPDATE", [userId]);
        if (!row) throw new NotFoundException("Cart owner was not found");
    }

    async findOperation(tx: TransactionContext, userId: string, operationId: string): Promise<CartMergeOperation | null> {
        const [row] = await tx.query<CartMergeOperation[]>(
            `SELECT payload_hash AS payloadHash, result_json AS resultJson
             FROM cart_merge_operations WHERE user_id = ? AND operation_id = ? LIMIT 1 FOR UPDATE`,
            [userId, operationId],
        );
        return row || null;
    }

    createOperation(tx: TransactionContext, userId: string, operationId: string, payloadHash: string) {
        return tx.query(
            `INSERT INTO cart_merge_operations (user_id, operation_id, payload_hash, result_json)
             VALUES (?, ?, ?, JSON_OBJECT('accepted', JSON_ARRAY(), 'rejected', JSON_ARRAY()))`,
            [userId, operationId, payloadHash],
        );
    }

    async getOrCreateCart(tx: TransactionContext, userId: string): Promise<number> {
        const [current] = await tx.query<Array<{ id: number | string }>>(
            "SELECT id FROM carts WHERE user_id = ? AND done = 0 ORDER BY id LIMIT 1 FOR UPDATE",
            [userId],
        );
        if (current) return Number(current.id);
        const result = await tx.query<{ insertId?: number }>("INSERT INTO carts (user_id) VALUES (?)", [userId]);
        if (!result?.insertId) throw new Error("Unable to create the customer cart");
        return Number(result.insertId);
    }

    async getProductAvailability(tx: TransactionContext, productId: number): Promise<{ availableStock: number } | null> {
        const [row] = await tx.query<Array<{ available_stock: number | string }>>(
            `SELECT GREATEST(p.stock - COALESCE((
                SELECT SUM(ir.quantity)
                FROM inventory_reservations ir
                JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                WHERE ir.product_id = p.id AND pc.status = '${CHECKOUT_RESERVATION_STATUS.PENDING}'
                    AND pc.expires_at > UTC_TIMESTAMP()
            ), 0), 0) AS available_stock
             FROM products p WHERE p.id = ? AND p.stock >= 0 FOR UPDATE`,
            [productId],
        );
        return row ? { availableStock: Number(row.available_stock) } : null;
    }

    async getCartQuantity(tx: TransactionContext, cartId: number, productId: number): Promise<number> {
        const [row] = await tx.query<Array<{ quantity: number | string }>>(
            "SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ? LIMIT 1 FOR UPDATE",
            [cartId, productId],
        );
        return Number(row?.quantity || 0);
    }

    addItems(tx: TransactionContext, cartId: number, productId: number, quantity: number) {
        return tx.query(
            `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
            [cartId, productId, quantity],
        );
    }

    completeOperation(tx: TransactionContext, userId: string, operationId: string, result: CartMergeResult) {
        return tx.query(
            "UPDATE cart_merge_operations SET result_json = ? WHERE user_id = ? AND operation_id = ?",
            [JSON.stringify(result), userId, operationId],
        );
    }
}
