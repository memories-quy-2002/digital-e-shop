import { Injectable } from "@nestjs/common";
import type { InsertResult } from "#src/shared/interfaces/domain";
import type { TransactionContext } from "../database/transaction";
import type {
    CheckoutReservationItem,
    LockedProductRow,
    PendingCheckoutRow,
    PendingCheckoutInsertInput,
    ReservedQuantityRow,
} from "./orders.types";

@Injectable()
export class CheckoutReservationRepository {
    async lockProducts(tx: TransactionContext, productIds: number[]): Promise<LockedProductRow[]> {
        if (productIds.length === 0) return [];

        const placeholders = productIds.map(() => "?").join(", ");
        return tx.query<LockedProductRow[]>(
            `SELECT id, name, stock
             FROM products
             WHERE id IN (${placeholders}) AND stock >= 0
             ORDER BY id
             FOR UPDATE`,
            productIds,
        );
    }

    async getActiveReservationQuantities(tx: TransactionContext, productIds: number[]): Promise<ReservedQuantityRow[]> {
        if (productIds.length === 0) return [];

        const placeholders = productIds.map(() => "?").join(", ");
        return tx.query<ReservedQuantityRow[]>(
            `SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
             FROM inventory_reservations ir
             JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
             WHERE ir.product_id IN (${placeholders})
               AND pc.status = 'PENDING'
               AND pc.expires_at > UTC_TIMESTAMP()
             GROUP BY ir.product_id`,
            productIds,
        );
    }

    async insertPendingCheckout(tx: TransactionContext, input: PendingCheckoutInsertInput): Promise<InsertResult> {
        return tx.query<InsertResult>(
            `INSERT INTO pending_checkouts
                (stripe_session_id, reservation_token, user_id, cart_json, total_price, discount, shipping_address, status, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            [null, input.reservationToken, input.userId, input.cartJson, input.totalPrice, input.discount, input.shippingAddress, input.expiresAt],
        );
    }

    async insertInventoryReservations(
        tx: TransactionContext,
        pendingCheckoutId: number,
        items: CheckoutReservationItem[],
    ): Promise<void> {
        if (items.length === 0) return;

        const values = items.map((item) => [pendingCheckoutId, item.productId, item.quantity]);
        await tx.query(
            `INSERT INTO inventory_reservations (pending_checkout_id, product_id, quantity)
             VALUES ?`,
            [values],
        );
    }

    async attachStripeSession(
        tx: TransactionContext,
        reservationToken: string,
        stripeSessionId: string,
    ): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE pending_checkouts
             SET stripe_session_id = ?
             WHERE reservation_token = ? AND status = 'PENDING' AND expires_at > UTC_TIMESTAMP()`,
            [stripeSessionId, reservationToken],
        );
        return result.affectedRows;
    }

    async getPendingCheckoutForUpdate(
        tx: TransactionContext,
        stripeSessionId: string,
    ): Promise<PendingCheckoutRow | null> {
        const rows = await tx.query<PendingCheckoutRow[]>(
            `SELECT id, stripe_session_id, reservation_token, user_id, cart_json, total_price,
                    discount, shipping_address, status, expires_at, discount_id, created_at, consumed_at
             FROM pending_checkouts
             WHERE stripe_session_id = ?
             LIMIT 1
             FOR UPDATE`,
            [stripeSessionId],
        );
        return rows[0] || null;
    }

    async getReservationItems(tx: TransactionContext, pendingCheckoutId: number): Promise<CheckoutReservationItem[]> {
        const rows = await tx.query<Array<{ product_id: number; quantity: number }>>(
            `SELECT product_id, quantity
             FROM inventory_reservations
             WHERE pending_checkout_id = ?
             ORDER BY product_id`,
            [pendingCheckoutId],
        );
        return rows.map((row) => ({ productId: Number(row.product_id), quantity: Number(row.quantity) }));
    }

    async consumeReservation(tx: TransactionContext, pendingCheckoutId: number): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE pending_checkouts
             SET status = 'CONSUMED', consumed_at = UTC_TIMESTAMP()
             WHERE id = ? AND status = 'PENDING'`,
            [pendingCheckoutId],
        );
        return result.affectedRows;
    }

    async expireReservationBySession(tx: TransactionContext, stripeSessionId: string): Promise<number> {
        const result = await tx.query<{ affectedRows: number }>(
            `UPDATE pending_checkouts
             SET status = 'EXPIRED'
             WHERE stripe_session_id = ? AND status = 'PENDING'`,
            [stripeSessionId],
        );
        return result.affectedRows;
    }

    async releaseReservation(tx: TransactionContext, reservationToken: string, reason: string): Promise<void> {
        void reason;
        await tx.query(
            `UPDATE pending_checkouts
             SET status = 'RELEASED'
             WHERE reservation_token = ? AND status = 'PENDING'`,
            [reservationToken],
        );
    }

    async getAvailableQuantity(tx: TransactionContext, productId: number): Promise<number> {
        const rows = await tx.query<Array<{ available_quantity: number | string | null }>>(
            `SELECT GREATEST(p.stock - COALESCE(SUM(
                    CASE
                        WHEN pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP() THEN ir.quantity
                        ELSE 0
                    END
                ), 0), 0) AS available_quantity
             FROM products p
             LEFT JOIN inventory_reservations ir ON ir.product_id = p.id
             LEFT JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
             WHERE p.id = ?
             GROUP BY p.id, p.stock`,
            [productId],
        );

        return rows.length > 0 ? Number(rows[0].available_quantity) || 0 : 0;
    }
}
