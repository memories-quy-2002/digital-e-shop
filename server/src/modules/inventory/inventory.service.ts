const InventoryMovement = require("./inventory.repository");
import type { DbError, LooseRecord } from "#src/shared/interfaces/domain";
import type { InventoryMovementInput } from "./inventory.dto";
import { logger } from "#src/shared/utils/logger";

const normalizeMovement = (movement: LooseRecord = {}) => ({
    id: Number(movement.id),
    product_id: Number(movement.product_id),
    product_name: movement.product_name,
    order_id: movement.order_id === null ? null : Number(movement.order_id),
    movement_type: movement.movement_type,
    quantity_change: Number(movement.quantity_change) || 0,
    stock_before: movement.stock_before === null ? null : Number(movement.stock_before),
    stock_after: movement.stock_after === null ? null : Number(movement.stock_after),
    note: movement.note,
    actor_id: movement.actor_id,
    created_at: movement.created_at,
});

async function getMovements(limit = 50): Promise<ReturnType<typeof normalizeMovement>[]> {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return new Promise((resolve, reject) => {
        InventoryMovement.getMovements(safeLimit, (err: DbError | null, rows: LooseRecord[]) => {
            if (err) return reject(err);
            resolve((rows || []).map(normalizeMovement));
        });
    });
}

function recordMovement(movement: InventoryMovementInput) {
    // Inventory history is useful for audit, but it should not block the primary
    // product or checkout operation when logging fails.
    InventoryMovement.createMovement(movement, (err: DbError | null) => {
        if (err) {
            logger.error({ err, movementType: movement.movementType, productId: movement.productId }, "Inventory movement log failed");
        }
    });
}

function recordMovements(movements: InventoryMovementInput[]) {
    // Bulk order deductions are logged asynchronously for the same reason as a
    // single movement: preserve checkout success after the order commits.
    InventoryMovement.createMovements(movements, (err: DbError | null) => {
        if (err) {
            logger.error({ err, count: movements.length }, "Inventory movement bulk log failed");
        }
    });
}

module.exports = {
    getMovements,
    recordMovement,
    recordMovements,
};

