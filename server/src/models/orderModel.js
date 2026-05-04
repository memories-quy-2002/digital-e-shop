const pool = require("../config/db");

const QUERY_TIMEOUT = 8000;

const query = (sql, params, callback) => {
    if (typeof params === "function") {
        return pool.query({ sql, timeout: QUERY_TIMEOUT }, params);
    }
    return pool.query({ sql, timeout: QUERY_TIMEOUT }, params, callback);
};

const startTransaction = (callback) => {
    query("START TRANSACTION", callback);
};

const commit = (callback) => {
    query("COMMIT", callback);
};

const rollback = (callback) => {
    query("ROLLBACK", callback);
};

const updateCartDone = (uid, callback) => {
    query("UPDATE carts SET done = 1 WHERE user_id = ?", [uid], callback);
};

const insertOrder = (uid, totalPrice, discount, subtotal, shippingAddress, paymentMethod, callback) => {
    query(
        "INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address, payment_method) VALUES (?, ?, ?, ?, ?, ?)",
        [uid, totalPrice, discount, subtotal, shippingAddress, paymentMethod],
        callback
    );
};

const insertOrderItem = (orderId, productId, quantity, totalPrice, callback) => {
    query(
        "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)",
        [orderId, productId, quantity, totalPrice],
        callback
    );
};

const updateProductStock = (productId, quantity, callback) => {
    query("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId], callback);
};

const getOrders = (callback) => {
    query(`SELECT * FROM orders`, callback);
};

const getOrdersPaginated = (limit, offset, callback) => {
    query(`SELECT * FROM orders ORDER BY date_added DESC LIMIT ? OFFSET ?`, [limit, offset], callback);
};

const getOrdersCount = (callback) => {
    query(`SELECT COUNT(*) AS total FROM orders`, callback);
};

const updateOrderStatus = (orderId, status, callback) => {
    query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], callback);
};

const getOrderById = (orderId, callback) => {
    query(`SELECT * FROM orders WHERE id = ?`, [orderId], callback);
};

const getOrderItems = (callback) => {
    query(
        `SELECT 
            p.id,
            p.name,
            p.price,
            oi.order_id,
            SUM(oi.quantity) AS sales,
            SUM(oi.total_price) AS revenue
        FROM 
            products p
        JOIN 
            order_items oi ON p.id = oi.product_id
        JOIN 
            orders o ON oi.order_id = o.id
        GROUP BY 
            p.id, p.name, p.price, oi.order_id
        ORDER BY 
            revenue DESC;
        `,
        callback
    );
};

const getOrderItemsPaginated = (limit, offset, callback) => {
    query(
        `SELECT 
            p.id,
            p.name,
            p.price,
            oi.order_id,
            SUM(oi.quantity) AS sales,
            SUM(oi.total_price) AS revenue
        FROM 
            products p
        JOIN 
            order_items oi ON p.id = oi.product_id
        JOIN 
            orders o ON oi.order_id = o.id
        GROUP BY 
            p.id, p.name, p.price, oi.order_id
        ORDER BY 
            revenue DESC
        LIMIT ? OFFSET ?;
        `,
        [limit, offset],
        callback
    );
};

const getOrderItemsCount = (callback) => {
    query(
        `SELECT COUNT(*) AS total FROM (
            SELECT p.id
            FROM products p
            JOIN order_items oi ON p.id = oi.product_id
            JOIN orders o ON oi.order_id = o.id
            GROUP BY p.id, p.name, p.price, oi.order_id
        ) AS grouped_items`,
        callback
    );
};

const applyDiscount = (discountCode, callback) => {
    query(`SELECT * FROM discounts WHERE discount_code = ?`, [discountCode], callback);
};

module.exports = {
    startTransaction,
    commit,
    rollback,
    updateCartDone,
    insertOrder,
    insertOrderItem,
    updateProductStock,
    getOrders,
    getOrdersPaginated,
    getOrdersCount,
    getOrderById,
    updateOrderStatus,
    getOrderItems,
    getOrderItemsPaginated,
    getOrderItemsCount,
    applyDiscount,
};
