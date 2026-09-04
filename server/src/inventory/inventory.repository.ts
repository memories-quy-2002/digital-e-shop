import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { InventoryMovementInput } from "./inventory.dto";
import type { InventoryMovementRow } from "./inventory.types";

@Injectable()
export class InventoryRepository {
    private tableReady = false;

    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    private ensureInventoryMovementTable(callback: QueryCallback<void>) {
        if (this.tableReady) {
            callback();
            return;
        }

        this.query(
            `CREATE TABLE IF NOT EXISTS inventory_movements (
                id INT NOT NULL AUTO_INCREMENT,
                product_id INT NOT NULL,
                order_id INT NULL,
                movement_type VARCHAR(40) NOT NULL,
                quantity_change INT NOT NULL,
                stock_before INT NULL,
                stock_after INT NULL,
                note VARCHAR(255) NULL,
                actor_id VARCHAR(255) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                INDEX inventory_movements_product_id_idx (product_id),
                INDEX inventory_movements_created_at_idx (created_at)
            )`,
            undefined,
            (err: Error | null) => {
                if (err) return callback(err);
                this.tableReady = true;
                callback();
            },
        );
    }

    createMovement(movement: InventoryMovementInput, callback: QueryCallback<UpdateResult> = () => {}) {
        this.ensureInventoryMovementTable((err: Error | null) => {
            if (err) return callback(err);
            this.query(
                `INSERT INTO inventory_movements
                    (product_id, order_id, movement_type, quantity_change, stock_before, stock_after, note, actor_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    movement.productId,
                    movement.orderId || null,
                    movement.movementType,
                    movement.quantityChange,
                    movement.stockBefore ?? null,
                    movement.stockAfter ?? null,
                    movement.note || null,
                    movement.actorId || null,
                ],
                callback,
            );
        });
    }

    createMovements(movements: InventoryMovementInput[], callback: QueryCallback<UpdateResult> = () => {}) {
        this.ensureInventoryMovementTable((err: Error | null) => {
            if (err) return callback(err);
            if (!movements || movements.length === 0) return callback(null, { affectedRows: 0 });

            const values = movements.map((movement: InventoryMovementInput) => [
                movement.productId,
                movement.orderId || null,
                movement.movementType,
                movement.quantityChange,
                movement.stockBefore ?? null,
                movement.stockAfter ?? null,
                movement.note || null,
                movement.actorId || null,
            ]);

            this.query(
                `INSERT INTO inventory_movements
                    (product_id, order_id, movement_type, quantity_change, stock_before, stock_after, note, actor_id)
                VALUES ?`,
                [values],
                callback,
            );
        });
    }

    getMovements(limit: number, callback: QueryCallback<InventoryMovementRow[]>) {
        this.ensureInventoryMovementTable((err: Error | null) => {
            if (err) return callback(err);
            this.query(
                `SELECT im.id, im.product_id, p.name AS product_name, im.order_id, im.movement_type,
                    im.quantity_change, im.stock_before, im.stock_after, im.note, im.actor_id,
                    DATE_FORMAT(im.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
                FROM inventory_movements im
                LEFT JOIN products p ON p.id = im.product_id
                ORDER BY im.created_at DESC, im.id DESC
                LIMIT ?`,
                [limit],
                callback,
            );
        });
    }
}
