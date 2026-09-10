import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, UpdateResult } from "#src/shared/interfaces/domain";
import type { CartItemRow, CartRow } from "./cart.types";

@Injectable()
export class CartRepository {
    addItemToCartByUserId(uid: string, pid: number, quantity: number, callback: QueryCallback<UpdateResult>) {
        pool.query(
            `INSERT INTO carts (user_id)
            SELECT ?
            WHERE NOT EXISTS (
                SELECT 1 FROM carts WHERE user_id = ? AND done = 0);`,
            [uid, uid],
            callback,
        );
    }

    getCartIdByUserId(uid: string, callback: QueryCallback<CartRow[]>) {
        pool.query("SELECT id FROM carts WHERE user_id = ? AND done = 0 LIMIT 1", [uid], callback);
    }

    addItemToCart(cartId: number, pid: number, quantity: number, callback: QueryCallback<UpdateResult>) {
        pool.query(
            `INSERT INTO cart_items (cart_id, product_id, quantity)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);`,
            [cartId, pid, quantity],
            callback,
        );
    }

    getCartItemsByUserId(uid: string, callback: QueryCallback<CartRow[]>) {
        pool.query(`SELECT id FROM carts WHERE user_id = ? AND done = 0 LIMIT 1`, [uid], callback);
    }

    getCartItemsDetails(cartId: number, callback: QueryCallback<CartItemRow[]>) {
        pool.query(
            `SELECT
                ci.id AS cart_item_id,
                p.id AS product_id,
                p.name AS product_name,
                p.sku,
                p.manufacturer_part_number,
                p.warranty_months,
                b.name AS brand,
                c.name AS category,
                p.price,
                p.sale_price,
                p.stock,
                GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock,
                p.main_image,
                p.specifications,
                COALESCE((
                    SELECT JSON_OBJECTAGG(
                        pa.attribute_key,
                        JSON_OBJECT(
                            'label', pa.label,
                            'type', pa.value_type,
                            'value', IF(pa.value_type = 'number', pa.number_value, pa.text_value),
                            'unit', pa.unit,
                            'filterable', pa.filterable
                        )
                    )
                    FROM product_attributes pa
                    WHERE pa.product_id = p.id
                ), JSON_OBJECT()) AS attributes,
                ci.quantity
            FROM
                cart_items ci
            JOIN products p ON
                ci.product_id = p.id
            JOIN brands b ON
                p.brand_id = b.id
            JOIN categories c ON
                p.category_id = c.id
            LEFT JOIN (
                SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
                GROUP BY ir.product_id
            ) active_reservations ON active_reservations.product_id = p.id
            WHERE ci.cart_id = ? AND p.stock >= 0;  `,
            [cartId],
            callback,
        );
    }

    getCheckoutCartItemsDetails(cartId: number, callback: QueryCallback<CartItemRow[]>) {
        pool.query(
            `SELECT
                ci.id AS cart_item_id,
                ci.product_id,
                p.name AS product_name,
                p.sku,
                p.manufacturer_part_number,
                p.warranty_months,
                b.name AS brand,
                c.name AS category,
                p.price,
                p.sale_price,
                p.stock,
                GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock,
                p.main_image,
                p.specifications,
                COALESCE((
                    SELECT JSON_OBJECTAGG(
                        pa.attribute_key,
                        JSON_OBJECT(
                            'label', pa.label,
                            'type', pa.value_type,
                            'value', IF(pa.value_type = 'number', pa.number_value, pa.text_value),
                            'unit', pa.unit,
                            'filterable', pa.filterable
                        )
                    )
                    FROM product_attributes pa
                    WHERE pa.product_id = p.id
                ), JSON_OBJECT()) AS attributes,
                ci.quantity
            FROM cart_items ci
            LEFT JOIN products p ON p.id = ci.product_id
            LEFT JOIN brands b ON b.id = p.brand_id
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN (
                SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
                GROUP BY ir.product_id
            ) active_reservations ON active_reservations.product_id = p.id
            WHERE ci.cart_id = ?`,
            [cartId],
            callback,
        );
    }

    getGuestCartPreviewItems(productIds: number[], callback: QueryCallback<CartItemRow[]>) {
        if (productIds.length === 0) {
            callback(null, []);
            return;
        }

        const placeholders = productIds.map(() => "?").join(", ");
        pool.query(
            `SELECT
                p.id AS product_id,
                p.name AS product_name,
                p.sku,
                p.manufacturer_part_number,
                p.warranty_months,
                b.name AS brand,
                c.name AS category,
                p.price,
                p.sale_price,
                p.stock,
                GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock,
                p.main_image,
                p.specifications
            FROM products p
            JOIN brands b ON p.brand_id = b.id
            JOIN categories c ON p.category_id = c.id
            LEFT JOIN (
                SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
                GROUP BY ir.product_id
            ) active_reservations ON active_reservations.product_id = p.id
            WHERE p.id IN (${placeholders})`,
            productIds,
            callback,
        );
    }

    updateCartItemQuantity(cartItemId: number, quantity: number, callback: QueryCallback<UpdateResult>) {
        pool.query(`UPDATE cart_items SET quantity = ? WHERE id = ?`, [quantity, cartItemId], callback);
    }

    getCartItemStock(cartItemId: number, callback: QueryCallback<CartItemRow[]>) {
        pool.query(
            `SELECT GREATEST(p.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock
            FROM cart_items ci
            JOIN products p ON p.id = ci.product_id
            LEFT JOIN (
                SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
                WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
                GROUP BY ir.product_id
            ) active_reservations ON active_reservations.product_id = p.id
            WHERE ci.id = ?`,
            [cartItemId],
            callback,
        );
    }

    deleteCartItem(cartItemId: number, callback: QueryCallback<UpdateResult>) {
        pool.query(`DELETE FROM cart_items WHERE id = ?`, [cartItemId], callback);
    }
}
