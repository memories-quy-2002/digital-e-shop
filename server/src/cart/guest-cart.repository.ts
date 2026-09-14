import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { withTransaction } from "#src/database/transaction";
import type { QueryCallback } from "#src/shared/interfaces/domain";
import type { GuestCartStoredItem } from "./cart.types";
import { GUEST_CART_TTL_DAYS } from "./guest-cart";

@Injectable()
export class GuestCartRepository {
    getGuestCartItems(guestCartId: string, callback: QueryCallback<GuestCartStoredItem[]>) {
        pool.query(
            `SELECT product_id, quantity
             FROM guest_cart_items gci
             JOIN guest_carts gc ON gc.id = gci.guest_cart_id
             WHERE gci.guest_cart_id = ?
                 AND gc.converted_at IS NULL
                 AND gc.expires_at > UTC_TIMESTAMP()
             ORDER BY gci.id`,
            [guestCartId],
            callback,
        );
    }

    async replaceGuestCart(guestCartId: string, items: GuestCartStoredItem[]): Promise<void> {
        await withTransaction(async (transaction) => {
            await transaction.query(
                `INSERT INTO guest_carts (id, expires_at)
                 VALUES (?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))
                 ON DUPLICATE KEY UPDATE
                    expires_at = DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY),
                    updated_at = UTC_TIMESTAMP(),
                    last_seen_at = UTC_TIMESTAMP(),
                    converted_at = NULL`,
                [guestCartId, GUEST_CART_TTL_DAYS, GUEST_CART_TTL_DAYS],
            );
            await transaction.query("DELETE FROM guest_cart_items WHERE guest_cart_id = ?", [guestCartId]);
            if (items.length === 0) return;

            const values = items.map(() => "(?, ?, ?)").join(", ");
            const params = items.flatMap((item) => [guestCartId, item.product_id, item.quantity]);
            await transaction.query(
                `INSERT INTO guest_cart_items (guest_cart_id, product_id, quantity)
                 VALUES ${values}`,
                params,
            );
        });
    }

    async clearGuestCart(guestCartId: string, converted: boolean): Promise<void> {
        await withTransaction(async (transaction) => {
            await transaction.query(
                `UPDATE guest_carts
                 SET updated_at = UTC_TIMESTAMP(),
                     last_seen_at = UTC_TIMESTAMP(),
                     converted_at = CASE WHEN ? = 1 THEN UTC_TIMESTAMP() ELSE converted_at END
                 WHERE id = ?`,
                [converted ? 1 : 0, guestCartId],
            );
            await transaction.query("DELETE FROM guest_cart_items WHERE guest_cart_id = ?", [guestCartId]);
        });
    }

}
