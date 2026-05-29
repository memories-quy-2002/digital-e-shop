const Order = require("../models/orderModel");
const pool = require("../config/db");
const util = require("util");
const cartService = require("./cartService");
const inventoryMovementService = require("./inventoryMovementService");
const orderTimelineService = require("./orderTimelineService");
const notificationService = require("./customerNotificationService");
import type {
    CartItemRow,
    CartValidationIssue,
    CheckoutValidationResult,
    InsertResult,
    InventoryMovementInput,
    LockedProductRow,
    OrderDetail,
    OrderDetailRow,
    OrderSummaryRow,
    OrderTimelineRow,
    PromotionRow,
    PurchasePayload,
} from "../types/domain";

const QUERY_TIMEOUT = 8000;
const getConnection = util.promisify(pool.getConnection).bind(pool);

type DbConnection = {
    query: (sql: unknown, values?: unknown) => unknown;
    beginTransaction: (callback: (err?: Error | null) => void) => void;
    commit: (callback: (err?: Error | null) => void) => void;
    rollback: (callback: (err?: Error | null) => void) => void;
    release: () => void;
};

const createCheckoutError = (message: string, statusCode = 409, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });

async function makePurchase(uid: string, { totalPrice, cart, discount, shippingAddress, paymentMethod }: PurchasePayload) {
    const startedAt = Date.now();
    console.log("[makePurchase] start", { uid, items: cart?.length, totalPrice, paymentMethod });

    if (!cart || cart.length === 0) {
        throw new Error("Cart is empty");
    }

    const checkoutValidation = await cartService.validateCheckoutSubmission(uid, cart, totalPrice) as CheckoutValidationResult;
    if (checkoutValidation.cartItems.length === 0) {
        throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", 400);
    }
    if (checkoutValidation.issues.length > 0) {
        throw createCheckoutError(
            "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
            409,
            {
                issues: checkoutValidation.issues,
                authoritativeCart: checkoutValidation.cartItems,
                authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            }
        );
    }
    if (checkoutValidation.mismatches.length > 0) {
        throw createCheckoutError(
            "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
            409,
            {
                mismatches: checkoutValidation.mismatches,
                authoritativeCart: checkoutValidation.cartItems,
                authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            }
        );
    }

    const authoritativeCart = checkoutValidation.cartItems;
    const authoritativeTotalPrice = checkoutValidation.authoritativeTotalPrice;

    const connection = await getConnection() as DbConnection;
    const query = util.promisify(connection.query).bind(connection);
    const begin = util.promisify(connection.beginTransaction).bind(connection);
    const commit = util.promisify(connection.commit).bind(connection);
    const rollback = util.promisify(connection.rollback).bind(connection);

    const q = <T = unknown>(sql: string, values?: unknown[]) => query({ sql, timeout: QUERY_TIMEOUT }, values) as Promise<T>;

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

            const orderResult = await q<InsertResult>(
                "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, date_added) VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                [uid, authoritativeTotalPrice, discount, shippingAddress, paymentMethod]
            );
            const orderId = orderResult.insertId;
            console.log("[makePurchase] order inserted", { orderId });

            const orderItemsValues = authoritativeCart.map((product: CartItemRow) => [
                orderId,
                Number(product.product_id || 0),
                Number(product.quantity) || 0,
                ((product.sale_price !== null && product.sale_price !== undefined ? Number(product.sale_price) : Number(product.price) || 0) || 0) * (Number(product.quantity) || 0),
            ]);

            const productQuantities = authoritativeCart.reduce((acc, product) => {
                const productId = Number(product.product_id || 0);
                const quantity = Number(product.quantity) || 0;
                const currentQuantity = acc.get(productId) || 0;
                acc.set(productId, currentQuantity + quantity);
                return acc;
            }, new Map<number, number>());

            let inventoryMovements: InventoryMovementInput[] = [];
            if (orderItemsValues.length > 0) {
                console.log("[makePurchase] insertOrderItems", { orderId, count: orderItemsValues.length });
                await q(
                    "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES ?",
                    [orderItemsValues]
                );

                const productIds = [...productQuantities.keys()];
                const placeholderList = productIds.map(() => "?").join(", ");
                const authoritativeItemsById = new Map(authoritativeCart.map((item) => [Number(item.product_id || 0), item]));

                const lockedProducts = await q<LockedProductRow[]>(
                    `SELECT id, name, stock FROM products WHERE id IN (${placeholderList}) AND stock >= 0 FOR UPDATE`,
                    productIds
                );

                // Lock product rows before checking stock and decrementing it so
                // concurrent checkouts cannot oversell the same product.
                const stockById = new Map(lockedProducts.map((row) => [row.id, row.stock]));
                for (const [productId, quantity] of productQuantities.entries()) {
                    const authoritativeItem = authoritativeItemsById.get(productId);
                    const productName = String(authoritativeItem?.product_name || `Product #${productId}`);
                    const stock = stockById.get(productId);
                    if (stock == null) {
                        const issues: CartValidationIssue[] = [{
                            cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                            productId,
                            productName,
                            requestedQuantity: quantity,
                            availableStock: 0,
                            reason: "unavailable",
                        }];
                        throw createCheckoutError(
                            `${productName} is no longer available. Remove it from your cart and try again.`,
                            409,
                            {
                                issues,
                                authoritativeCart,
                                authoritativeTotalPrice,
                            }
                        );
                    }
                    if (stock < quantity) {
                        const issues: CartValidationIssue[] = [{
                            cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                            productId,
                            productName,
                            requestedQuantity: quantity,
                            availableStock: Number(stock) || 0,
                            reason: stock <= 0 ? "out_of_stock" : "insufficient_stock",
                        }];
                        throw createCheckoutError(
                            `${productName} only has ${stock} item(s) left. Update your cart and try again.`,
                            409,
                            {
                                issues,
                                authoritativeCart,
                                authoritativeTotalPrice,
                            }
                        );
                    }
                }

                inventoryMovements = [...productQuantities.entries()].map(([productId, quantity]) => {
                    const stockBefore = Number(stockById.get(productId)) || 0;
                    return {
                        productId,
                        orderId,
                        movementType: "sale",
                        quantityChange: -quantity,
                        stockBefore,
                        stockAfter: stockBefore - quantity,
                        note: `Stock deducted for order #${orderId}`,
                        actorId: uid,
                    };
                });

                const cases = productIds.map(() => "WHEN ? THEN ?");
                const caseValues = productIds.flatMap((productId) => [productId, productQuantities.get(productId)]);

                // Use one CASE update for all products in the order to keep the
                // transaction short and reduce lock time.
                console.log("[makePurchase] updateProductStock", { count: productIds.length });
                await q(
                    `UPDATE products
                    SET stock = stock - CASE id ${cases.join(" ")} END
                    WHERE id IN (${placeholderList})`,
                    [...caseValues, ...productIds]
                );
            }

            await q("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [uid]);
            console.log("[makePurchase] cart updated");

            await commit();
            // Audit-style side effects happen after commit. A logging failure
            // should not roll back a successfully placed order.
            orderTimelineService.recordTimelineEvent({
                orderId,
                status: 0,
                note: "Order was placed by the customer.",
                actorId: uid,
            });
            notificationService.notifyOrderPlaced(uid, orderId, Number(authoritativeTotalPrice) - Number(discount || 0));
            inventoryMovementService.recordMovements(inventoryMovements);
            console.log("[makePurchase] commit ok", { orderId, ms: Date.now() - startedAt });
            const [order] = await q<Array<{ id: number; date_added: string }>>(
                `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                FROM orders
                WHERE id = ?`,
                [orderId]
            );
            return order || { id: orderId, date_added: new Date().toISOString() };
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

async function getOrders(): Promise<OrderSummaryRow[]> {
    return new Promise((resolve, reject) => {
        Order.getOrders((err: Error | null, results: OrderSummaryRow[]) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrdersPaginated(limit: number, offset: number): Promise<OrderSummaryRow[]> {
    return new Promise((resolve, reject) => {
        Order.getOrdersPaginated(limit, offset, (err: Error | null, results: OrderSummaryRow[]) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrdersCount(): Promise<number> {
    return new Promise((resolve, reject) => {
        Order.getOrdersCount((err: Error | null, results: Array<{ total: number }>) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function getOrdersByUserId(uid: string): Promise<OrderSummaryRow[]> {
    return new Promise((resolve, reject) => {
        Order.getOrdersByUserId(uid, (err: Error | null, results: OrderSummaryRow[]) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrderDetail(orderId: number): Promise<(OrderDetail & { timeline?: unknown }) | null> {
    return new Promise((resolve, reject) => {
        Order.getOrderDetail(orderId, (err: Error | null, results: OrderDetailRow[]) => {
            if (err) return reject(err);
            if (results.length === 0) return resolve(null);

            const first = results[0];
            const order: OrderDetail = {
                id: first.id,
                date_added: first.date_added,
                user_id: first.user_id,
                customer_name: first.customer_name,
                customer_email: first.customer_email,
                status: first.status,
                total_price: Number(first.total_price) || 0,
                discount: Number(first.discount) || 0,
                shipping_address: first.shipping_address,
                payment_method: first.payment_method,
                items: results
                    .filter((row) => row.product_id)
                    .map((row) => ({
                        id: row.order_item_id,
                        productId: row.product_id,
                        productName: row.product_name,
                        category: row.category,
                        brand: row.brand,
                        price: Number(row.price) || 0,
                        sale_price: row.sale_price === null ? null : Number(row.sale_price) || null,
                        stock: Number(row.stock) || 0,
                        main_image: row.main_image,
                        quantity: Number(row.quantity) || 0,
                        totalPrice: Number(row.item_total_price) || 0,
                    })),
            };

            orderTimelineService.getTimeline(orderId, order)
                .then((timeline: OrderTimelineRow[]) => resolve({ ...order, timeline }))
                .catch(() => resolve(order));
        });
    });
}

async function changeOrderStatus(orderId: number, status: number, actorId: string | number | null = null): Promise<OrderSummaryRow> {
    return new Promise((resolve, reject) => {
        Order.updateOrderStatus(orderId, status, (err: Error | null) => {
            if (err) return reject(err);

            Order.getOrderById(orderId, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                if (results.length === 0) return reject(new Error("Order not found"));
                orderTimelineService.recordTimelineEvent({
                    orderId,
                    status,
                    note: `Order status changed to ${status}.`,
                    actorId,
                });
                notificationService.notifyOrderStatus(results[0].user_id, orderId, status);
                resolve(results[0]);
            });
        });
    });
}

async function getOrderItems(): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        Order.getOrderItems((err: Error | null, results: unknown[]) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrderItemsPaginated(limit: number, offset: number): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        Order.getOrderItemsPaginated(limit, offset, (err: Error | null, results: unknown[]) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getOrderItemsCount(): Promise<number> {
    return new Promise((resolve, reject) => {
        Order.getOrderItemsCount((err: Error | null, results: Array<{ total: number }>) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function applyDiscount(discountCode: string): Promise<PromotionRow | null> {
    return new Promise((resolve, reject) => {
        Order.applyDiscount(discountCode, (err: Error | null, results: PromotionRow[]) => {
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
    getOrdersByUserId,
    getOrderDetail,
    changeOrderStatus,
    getOrderItems,
    getOrderItemsPaginated,
    getOrderItemsCount,
    applyDiscount,
};
