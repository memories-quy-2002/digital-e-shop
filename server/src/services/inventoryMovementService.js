const InventoryMovement = require("../models/inventoryMovementModel");

const normalizeMovement = (movement = {}) => ({
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

async function getMovements(limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
    return new Promise((resolve, reject) => {
        InventoryMovement.getMovements(safeLimit, (err, rows) => {
            if (err) return reject(err);
            resolve((rows || []).map(normalizeMovement));
        });
    });
}

function recordMovement(movement) {
    InventoryMovement.createMovement(movement, (err) => {
        if (err) {
            console.error("Inventory movement log failed:", err.message);
        }
    });
}

function recordMovements(movements) {
    InventoryMovement.createMovements(movements, (err) => {
        if (err) {
            console.error("Inventory movement bulk log failed:", err.message);
        }
    });
}

module.exports = {
    getMovements,
    recordMovement,
    recordMovements,
};
