const pool = require("../config/db");
const Promotion = require("./promotionModel");

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

const insertOrder = (uid, totalPrice, discount, shippingAddress, paymentMethod, callback) => {
    query(
        "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, date_added) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())",
        [uid, totalPrice, discount, shippingAddress, paymentMethod],
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

const orderSelect = `
    o.id,
    o.user_id,
    COALESCE(u.username, o.user_id) AS customer_name,
    u.email AS customer_email,
    DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added,
    o.total_price,
    o.discount,
    o.status,
    o.shipping_address,
    o.payment_method
`;

const orderUserJoin = `
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
`;

const getOrders = (callback) => {
    query(`SELECT ${orderSelect} ${orderUserJoin} ORDER BY o.date_added DESC`, callback);
};

const getOrdersPaginated = (limit, offset, callback) => {
    query(`SELECT ${orderSelect} ${orderUserJoin} ORDER BY o.date_added DESC LIMIT ? OFFSET ?`, [limit, offset], callback);
};

const getOrdersCount = (callback) => {
    query(`SELECT COUNT(*) AS total FROM orders`, callback);
};

const updateOrderStatus = (orderId, status, callback) => {
    query(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId], callback);
};

const getOrderById = (orderId, callback) => {
    query(`SELECT ${orderSelect} ${orderUserJoin} WHERE o.id = ?`, [orderId], callback);
};

const getOrdersByUserId = (uid, callback) => {
    query(`SELECT ${orderSelect} ${orderUserJoin} WHERE o.user_id = ? ORDER BY o.date_added DESC`, [uid], callback);
};

const getOrderDetail = (orderId, callback) => {
    query(
        `SELECT 
            o.*,
            COALESCE(u.username, o.user_id) AS customer_name,
            u.email AS customer_email,
            DATE_FORMAT(o.date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added,
            oi.id AS order_item_id,
            oi.product_id,
            oi.quantity,
            oi.total_price AS item_total_price,
            p.name AS product_name,
            p.price,
            p.sale_price,
            p.stock,
            p.main_image,
            c.name AS category,
            b.name AS brand
        FROM orders o
        LEFT JOIN users u ON u.id = o.user_id
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN products p ON p.id = oi.product_id
        LEFT JOIN categories c ON c.id = p.category_id
        LEFT JOIN brands b ON b.id = p.brand_id
        WHERE o.id = ?`,
        [orderId],
        callback
    );
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
    Promotion.getActivePromotionByCode(discountCode, callback);
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
    getOrdersByUserId,
    getOrderDetail,
    updateOrderStatus,
    getOrderItems,
    getOrderItemsPaginated,
    getOrderItemsCount,
    applyDiscount,
};
