const Order = require("../models/orderModel");
const pool = require("../config/db");
const util = require("util");

const QUERY_TIMEOUT = 8000;
const getConnection = util.promisify(pool.getConnection).bind(pool);

async function makePurchase(uid, { totalPrice, cart, discount, subtotal, shippingAddress }) {
    const startedAt = Date.now();
    console.log("[makePurchase] start", { uid, items: cart?.length, totalPrice });
    const operation = (async () => {
        if (!cart || cart.length === 0) {
            throw new Error("Cart is empty");
        }

        const connection = await getConnection();
        const query = util.promisify(connection.query).bind(connection);
        const begin = util.promisify(connection.beginTransaction).bind(connection);
        const commit = util.promisify(connection.commit).bind(connection);
        const rollback = util.promisify(connection.rollback).bind(connection);

        const q = (sql, values) =>
            query({ sql, timeout: QUERY_TIMEOUT }, values);

        try {
            await begin();
            console.log("[makePurchase] transaction started");

            await q("UPDATE cart SET done = 1 WHERE user_id = ?", [uid]);
            console.log("[makePurchase] cart updated");

            const orderResult = await q(
                "INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address) VALUES (?, ?, ?, ?, ?)",
                [uid, totalPrice, discount, subtotal, shippingAddress]
            );

            const orderId = orderResult.insertId;
            console.log("[makePurchase] order inserted", { orderId });

            for (const product of cart) {
                console.log("[makePurchase] insertOrderItem", {
                    orderId,
                    productId: product.productId,
                    quantity: product.quantity,
                });
                await q(
                    "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)",
                    [
                        orderId,
                        product.productId,
                        product.quantity,
                        (product.sale_price ? product.sale_price : product.price) * product.quantity,
                    ]
                );
                console.log("[makePurchase] updateProductStock", {
                    productId: product.productId,
                    quantity: product.quantity,
                });
                await q("UPDATE products SET stock = stock - ? WHERE id = ?", [
                    product.quantity,
                    product.productId,
                ]);
            }

            await commit();
            console.log("[makePurchase] commit ok", { orderId, ms: Date.now() - startedAt });
            return orderId;
        } catch (err) {
            console.error("[makePurchase] item processing error", err);
            await rollback();
            throw err;
        } finally {
            connection.release();
        }
    })();
    const timeoutMs = 8000;
    const timeout = new Promise((_, reject) => {
        setTimeout(() => {
            console.error("[makePurchase] timeout", { uid, ms: Date.now() - startedAt });
            reject(new Error("Database timeout"));
        }, timeoutMs);
    });
    return Promise.race([operation, timeout]);
}

async function getOrders() {
    return new Promise((resolve, reject) => {
        Order.getOrders((err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function changeOrderStatus(orderId, status) {
    return new Promise((resolve, reject) => {
        Order.updateOrderStatus(orderId, status, (err) => {
            if (err) return reject(err);

            Order.getOrderById(orderId, (err, results) => {
                if (err) return reject(err);
                if (results.length === 0) return reject(new Error("Order not found"));
                resolve(results[0]);
            });
        });
    });
}

async function getOrderItems() {
    return new Promise((resolve, reject) => {
        Order.getOrderItems((err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function applyDiscount(discountCode) {
    return new Promise((resolve, reject) => {
        Order.applyDiscount(discountCode, (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return reject(new Error("Discount code not found"));
            resolve(results[0]);
        });
    });
}

module.exports = {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount,
};
