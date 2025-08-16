const pool = require("../config/db");

const startTransaction = (callback) => {
    pool.query("START TRANSACTION", callback);
};

const commit = (callback) => {
    pool.query("COMMIT", callback);
};

const rollback = (callback) => {
    pool.query("ROLLBACK", callback);
};

const updateCartDone = (uid, callback) => {
    pool.query("UPDATE cart SET done = 1 WHERE user_id = ?", [uid], callback);
};

const insertOrder = (uid, totalPrice, discount, subtotal, shippingAddress, callback) => {
    pool.query(
        "INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address) VALUES (?, ?, ?, ?, ?)",
        [uid, totalPrice, discount, subtotal, shippingAddress],
        callback
    );
};

const insertOrderItem = (orderId, productId, quantity, totalPrice, callback) => {
    pool.query(
        "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)",
        [orderId, productId, quantity, totalPrice],
        callback
    );
};

const updateProductStock = (productId, quantity, callback) => {
    pool.query("UPDATE products SET stock = stock - ? WHERE id = ?", [quantity, productId], callback);
};

const getOrders = (callback) => {
    pool.query(
        `SELECT * FROM orders`,
        callback
    );
}

const changeOrderStatus = (orderId, status, callback) => {
    pool.query(
        `UPDATE orders SET status = ? WHERE id = ?`, [status, orderId],
        callback
    );
}

const getOrderById = (orderId, callback) => {
    pool.query(
        `SELECT * FROM orders WHERE id = ?`, [orderId], callback
    );
}

const getOrderItems = (callback) => {
    pool.query(
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
}

const applyDiscount = (discountCode, callback) => {
    pool.query(
        `SELECT * FROM discount WHERE discount_code = ?`,
        [discountCode],
        callback
    );
}

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
    changeOrderStatus,
    getOrderItems,
    applyDiscount
}