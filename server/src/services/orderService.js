const Order = require("../models/orderModel");

async function makePurchase(uid, { totalPrice, cart, discount, subtotal, shippingAddress }) {
    if (!cart || cart.length === 0) {
        throw new Error("Cart is empty");
    }

    return new Promise((resolve, reject) => {
        Order.startTransaction((err) => {
            if (err) return reject(new Error("Error starting transaction"));

            // Mark cart as done
            Order.updateCartDone(uid, (err) => {
                if (err) {
                    Order.rollback(() => reject(new Error("Error updating cart")));
                    return;
                }

                // Insert new order
                Order.insertOrder(uid, totalPrice, discount, subtotal, shippingAddress, async (err, results) => {
                    if (err) {
                        Order.rollback(() => reject(new Error("Error inserting into orders")));
                        return;
                    }

                    const orderId = results.insertId;

                    try {
                        // Build promises for order items + stock update
                        const promises = cart.map((product) => {
                            return new Promise((res, rej) => {
                                Order.insertOrderItem(
                                    orderId,
                                    product.productId,
                                    product.quantity,
                                    (product.sale_price ? product.sale_price : product.price) * product.quantity,
                                    (err) => {
                                        if (err) return rej(err);
                                        Order.updateProductStock(product.productId, product.quantity, (err) => {
                                            if (err) return rej(err);
                                            res();
                                        });
                                    }
                                );
                            });
                        });

                        await Promise.all(promises);

                        Order.commit(() => resolve(orderId));
                    } catch (err) {
                        Order.rollback(() => reject(err));
                    }
                });
            });
        });
    });
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
    applyDiscount
};