const pool = require("../config/db");

let tableReady = false;

const query = (sql, params, callback) => {
    if (typeof params === "function") {
        return pool.query(sql, params);
    }
    return pool.query(sql, params, callback);
};

const ensureInventoryMovementTable = (callback) => {
    if (tableReady) {
        callback();
        return;
    }

    query(
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
        (err) => {
            if (err) return callback(err);
            tableReady = true;
            callback();
        }
    );
};

const createMovement = (movement, callback = () => {}) => {
    ensureInventoryMovementTable((err) => {
        if (err) return callback(err);
        query(
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
            callback
        );
    });
};

const createMovements = (movements, callback = () => {}) => {
    ensureInventoryMovementTable((err) => {
        if (err) return callback(err);
        if (!movements || movements.length === 0) return callback(null, { affectedRows: 0 });

        const values = movements.map((movement) => [
            movement.productId,
            movement.orderId || null,
            movement.movementType,
            movement.quantityChange,
            movement.stockBefore ?? null,
            movement.stockAfter ?? null,
            movement.note || null,
            movement.actorId || null,
        ]);

        query(
            `INSERT INTO inventory_movements
                (product_id, order_id, movement_type, quantity_change, stock_before, stock_after, note, actor_id)
            VALUES ?`,
            [values],
            callback
        );
    });
};

const getMovements = (limit, callback) => {
    ensureInventoryMovementTable((err) => {
        if (err) return callback(err);
        query(
            `SELECT im.id, im.product_id, p.name AS product_name, im.order_id, im.movement_type,
                im.quantity_change, im.stock_before, im.stock_after, im.note, im.actor_id,
                DATE_FORMAT(im.created_at, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
            FROM inventory_movements im
            LEFT JOIN products p ON p.id = im.product_id
            ORDER BY im.created_at DESC, im.id DESC
            LIMIT ?`,
            [limit],
            callback
        );
    });
};

module.exports = {
    ensureInventoryMovementTable,
    createMovement,
    createMovements,
    getMovements,
};
