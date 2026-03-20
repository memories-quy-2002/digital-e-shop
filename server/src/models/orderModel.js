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
    query("UPDATE cart SET done = 1 WHERE user_id = ?", [uid], callback);
};

const insertOrder = (uid, totalPrice, discount, subtotal, shippingAddress, callback) => {
    query(
        "INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address) VALUES (?, ?, ?, ?, ?)",
        [uid, totalPrice, discount, subtotal, shippingAddress],
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

const applyDiscount = (discountCode, callback) => {
    query(`SELECT * FROM discount WHERE discount_code = ?`, [discountCode], callback);
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
    getOrderById,
    updateOrderStatus,
    getOrderItems,
    applyDiscount,
};
