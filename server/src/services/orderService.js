const Order = require("../models/orderModel");
const pool = require("../config/db");
const util = require("util");

const QUERY_TIMEOUT = 8000;
const getConnection = util.promisify(pool.getConnection).bind(pool);

async function makePurchase(uid, { totalPrice, cart, discount, subtotal, shippingAddress, paymentMethod }) {
    const startedAt = Date.now();
    console.log("[makePurchase] start", { uid, items: cart?.length, totalPrice, paymentMethod });

    if (!cart || cart.length === 0) {
        throw new Error("Cart is empty");
    }

    const connection = await getConnection();
    const query = util.promisify(connection.query).bind(connection);
    const begin = util.promisify(connection.beginTransaction).bind(connection);
    const commit = util.promisify(connection.commit).bind(connection);
    const rollback = util.promisify(connection.rollback).bind(connection);

    const q = (sql, values) => query({ sql, timeout: QUERY_TIMEOUT }, values);

    let timeoutId;
    const timeoutMs = 8000;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            console.error("[makePurchase] timeout", { uid, ms: Date.now() - startedAt });
            reject(new Error("Database timeout"));
        }, timeoutMs);
    });

    const operation = (async () => {
        try {
            await begin();
            console.log("[makePurchase] transaction started");

            await q("UPDATE carts SET done = 1 WHERE user_id = ?", [uid]);
            console.log("[makePurchase] cart updated");

            const orderResult = await q(
                "INSERT INTO orders (user_id, total_price, discount, subtotal, shipping_address, payment_method) VALUES (?, ?, ?, ?, ?, ?)",
                [uid, totalPrice, discount, subtotal, shippingAddress, paymentMethod]
            );
            const orderId = orderResult.insertId;
            console.log("[makePurchase] order inserted", { orderId });

            const orderItemsValues = cart.map((product) => [
                orderId,
                product.productId,
                product.quantity,
                (product.sale_price ? product.sale_price : product.price) * product.quantity,
            ]);

            const productQuantities = cart.reduce((acc, product) => {
                const currentQuantity = acc.get(product.productId) || 0;
                acc.set(product.productId, currentQuantity + product.quantity);
                return acc;
            }, new Map());

            if (orderItemsValues.length > 0) {
                console.log("[makePurchase] insertOrderItems", { orderId, count: orderItemsValues.length });
                await q(
                    "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES ?",
                    [orderItemsValues]
                );

                const productIds = [...productQuantities.keys()];
                const placeholderList = productIds.map(() => "?").join(", ");

                const lockedProducts = await q(
                    `SELECT id, stock FROM products WHERE id IN (${placeholderList}) FOR UPDATE`,
                    productIds
                );

                const stockById = new Map(lockedProducts.map((row) => [row.id, row.stock]));
                for (const [productId, quantity] of productQuantities.entries()) {
                    const stock = stockById.get(productId);
                    if (stock == null) {
                        throw new Error(`Product ${productId} not found`);
                    }
                    if (stock < quantity) {
                        throw new Error(`Insufficient stock for product ${productId}`);
                    }
                }

                const cases = productIds.map(() => "WHEN ? THEN ?");
                const caseValues = productIds.flatMap((productId) => [productId, productQuantities.get(productId)]);

                console.log("[makePurchase] updateProductStock", { count: productIds.length });
                await q(
                    `UPDATE products
                    SET stock = stock - CASE id ${cases.join(" ")} END
                    WHERE id IN (${placeholderList})`,
                    [...caseValues, ...productIds]
                );
            }

            await commit();
            console.log("[makePurchase] commit ok", { orderId, ms: Date.now() - startedAt });
            return orderId;
        } catch (err) {
            console.error("[makePurchase] item processing error", err);
            try {
                await rollback();
            } catch (rollbackErr) {
                console.error("[makePurchase] rollback failed", rollbackErr);
            }
            throw err;
        } finally {
            connection.release();
        }
    })();

    try {
        return await Promise.race([operation, timeout]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getOrders() {
    return new Promise((resolve, reject) => {
        Order.getOrders((err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrdersPaginated(limit, offset) {
    return new Promise((resolve, reject) => {
        Order.getOrdersPaginated(limit, offset, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrdersCount() {
    return new Promise((resolve, reject) => {
        Order.getOrdersCount((err, results) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
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

async function getOrderItemsPaginated(limit, offset) {
    return new Promise((resolve, reject) => {
        Order.getOrderItemsPaginated(limit, offset, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrderItemsCount() {
    return new Promise((resolve, reject) => {
        Order.getOrderItemsCount((err, results) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function applyDiscount(discountCode) {
    return new Promise((resolve, reject) => {
        Order.applyDiscount(discountCode, (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) {
                resolve(null);
            };
            resolve(results[0]);
        });
    });
}

module.exports = {
    makePurchase,
    getOrders,
    getOrdersPaginated,
    getOrdersCount,
    changeOrderStatus,
    getOrderItems,
    getOrderItemsPaginated,
    getOrderItemsCount,
    applyDiscount,
};
