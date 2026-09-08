import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { QueryCallback, QueryParams, UpdateResult } from "#src/shared/interfaces/domain";
import type { InventoryMovementInput } from "./inventory.dto";
import type { InventoryMovementRow } from "./inventory.types";
import type { TransactionContext } from "../database/transaction";

@Injectable()
export class InventoryRepository {
    private query(sql: string, params?: QueryParams, callback?: QueryCallback) {
        if (typeof params === "function") {
            return pool.query(sql, params);
        }
        return pool.query(sql, params, callback);
    }

    createMovement(movement: InventoryMovementInput, callback: QueryCallback<UpdateResult> = () => {}) {
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
    }

    createMovements(movements: InventoryMovementInput[], callback: QueryCallback<UpdateResult> = () => {}) {
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
    }

    async createMovementsInTransaction(tx: TransactionContext, movements: InventoryMovementInput[]): Promise<void> {
        if (!movements || movements.length === 0) return;

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

        await tx.query(
            `INSERT INTO inventory_movements
                (product_id, order_id, movement_type, quantity_change, stock_before, stock_after, note, actor_id)
            VALUES ?`,
            [values],
        );
    }

    getMovements(limit: number, callback: QueryCallback<InventoryMovementRow[]>) {
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
    }
}
