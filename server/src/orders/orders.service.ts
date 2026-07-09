import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { logger } from "#src/shared/utils/logger";
import util from "node:util";
import type { InsertResult, UpdateResult } from "#src/shared/interfaces/domain";
import type { CartItemRow, CartValidationIssue } from "../cart/cart.types";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import type { OrderBySessionRow, OrderDetail, OrderDetailRow, OrderSummaryRow, OrderTimelineRow, LockedProductRow, PendingCheckoutRow } from "./orders.types";
import type { PromotionRow } from "../promotions/promotions.types";
import type { PurchasePayload } from "./orders.dto";
import { OrdersRepository } from "./orders.repository";
import { NestOrderTimelineService } from "./orders.timeline.service";
import { NestCartService } from "../cart/cart.service";
import { NestInventoryService } from "../inventory/inventory.service";
import { NestNotificationsService } from "../notifications/notifications.service";

const getConnection = util.promisify(pool.getConnection).bind(pool);

type DbConnection = {
    query: (sql: unknown, values?: unknown) => unknown;
    beginTransaction: (callback: (err?: Error | null) => void) => void;
    commit: (callback: (err?: Error | null) => void) => void;
    rollback: (callback: (err?: Error | null) => void) => void;
    release: () => void;
};

export const createCheckoutError = (message: string, statusCode = 409, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });

type CreateOrderFromCartInput = {
    uid: string;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
    // For card payments, Stripe has already captured payment by the time this
    // runs, so the order must still be created even if stock ran out in the
    // meantime — the conflict is logged for manual review instead of blocking.
    allowOversell?: boolean;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
};

const QUERY_TIMEOUT = 8000;

@Injectable()
export class NestOrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly orderTimelineService: NestOrderTimelineService,
        private readonly cartService: NestCartService,
        private readonly inventoryService: NestInventoryService,
        private readonly notificationsService: NestNotificationsService,
    ) {}

    async createOrderFromValidatedCart({
        uid,
        authoritativeCart,
        authoritativeTotalPrice,
        discount,
        shippingAddress,
        paymentMethod,
        allowOversell = false,
        stripeCheckoutSessionId = null,
        stripePaymentIntentId = null,
    }: CreateOrderFromCartInput): Promise<{ id: number; date_added: string }> {
        const startedAt = Date.now();
        logger.info({ uid, items: authoritativeCart?.length, authoritativeTotalPrice, paymentMethod, allowOversell }, "[createOrderFromValidatedCart] start");

        const connection = (await getConnection()) as DbConnection;
        const cxQuery = util.promisify(connection.query).bind(connection);
        const begin = util.promisify(connection.beginTransaction).bind(connection);
        const commit = util.promisify(connection.commit).bind(connection);
        const rollback = util.promisify(connection.rollback).bind(connection);

        const q = <T = unknown>(sql: string, values?: unknown[]) =>
            cxQuery({ sql, timeout: QUERY_TIMEOUT }, values) as Promise<T>;

        let timeoutId;
        const timeoutMs = 8000;
        const timeout = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                logger.error({ uid, ms: Date.now() - startedAt }, "[createOrderFromValidatedCart] timeout");
                reject(new Error("Database timeout"));
            }, timeoutMs);
        });

        const operation = (async () => {
            try {
                await begin();
                logger.debug("[createOrderFromValidatedCart] transaction started");

                const orderResult = await q<InsertResult>(
                    "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, stripe_checkout_session_id, stripe_payment_intent_id, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                    [uid, authoritativeTotalPrice, discount, shippingAddress, paymentMethod, stripeCheckoutSessionId, stripePaymentIntentId],
                );
                const orderId = orderResult.insertId;
                logger.debug({ orderId }, "[createOrderFromValidatedCart] order inserted");

                const orderItemsValues = authoritativeCart.map((product: CartItemRow) => [
                    orderId,
                    Number(product.product_id || 0),
                    Number(product.quantity) || 0,
                    ((product.sale_price !== null && product.sale_price !== undefined
                        ? Number(product.sale_price)
                        : Number(product.price) || 0) || 0) * (Number(product.quantity) || 0),
                ]);

                const productQuantities = authoritativeCart.reduce((acc: Map<number, number>, product: CartItemRow) => {
                    const productId = Number(product.product_id || 0);
                    const quantity = Number(product.quantity) || 0;
                    const currentQuantity = acc.get(productId) || 0;
                    acc.set(productId, currentQuantity + quantity);
                    return acc;
                }, new Map<number, number>());

                let inventoryMovements: InventoryMovementInput[] = [];
                if (orderItemsValues.length > 0) {
                    logger.debug({ orderId, count: orderItemsValues.length }, "[createOrderFromValidatedCart] insertOrderItems");
                    await q("INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES ?", [
                        orderItemsValues,
                    ]);

                    const productIds = [...productQuantities.keys()];
                    const placeholderList = productIds.map(() => "?").join(", ");
                    const authoritativeItemsById = new Map(
                        authoritativeCart.map((item: CartItemRow) => [Number(item.product_id || 0), item] as const),
                    );

                    const lockedProducts = await q<LockedProductRow[]>(
                        `SELECT id, name, stock FROM products WHERE id IN (${placeholderList}) AND stock >= 0 FOR UPDATE`,
                        productIds,
                    );

                    // Lock product rows before checking stock and decrementing it so
                    // concurrent checkouts cannot oversell the same product.
                    const stockById = new Map(lockedProducts.map((row) => [row.id, row.stock]));
                    for (const [productId, quantity] of productQuantities.entries()) {
                        const authoritativeItem = authoritativeItemsById.get(productId);
                        const productName = String(authoritativeItem?.product_name || `Product #${productId}`);
                        const stock = stockById.get(productId);
                        if (stock == null) {
                            if (!allowOversell) {
                                const issues: CartValidationIssue[] = [
                                    {
                                        cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                                        productId,
                                        productName,
                                        requestedQuantity: quantity,
                                        availableStock: 0,
                                        reason: "unavailable",
                                    },
                                ];
                                throw createCheckoutError(
                                    `${productName} is no longer available. Remove it from your cart and try again.`,
                                    409,
                                    { issues, authoritativeCart, authoritativeTotalPrice },
                                );
                            }
                            logger.error({ uid, productId, orderId }, "[createOrderFromValidatedCart] product unavailable during paid checkout — proceeding, needs manual review");
                            continue;
                        }
                        if (stock < quantity) {
                            if (!allowOversell) {
                                const issues: CartValidationIssue[] = [
                                    {
                                        cartItemId: Number(authoritativeItem?.cart_item_id || 0),
                                        productId,
                                        productName,
                                        requestedQuantity: quantity,
                                        availableStock: Number(stock) || 0,
                                        reason: stock <= 0 ? "out_of_stock" : "insufficient_stock",
                                    },
                                ];
                                throw createCheckoutError(
                                    `${productName} only has ${stock} item(s) left. Update your cart and try again.`,
                                    409,
                                    { issues, authoritativeCart, authoritativeTotalPrice },
                                );
                            }
                            logger.error({ uid, productId, orderId, stock, quantity }, "[createOrderFromValidatedCart] insufficient stock during paid checkout — proceeding, needs manual review");
                        }
                    }

                    inventoryMovements = [...productQuantities.entries()].reduce(
                        (movements: InventoryMovementInput[], [productId, quantity]) => {
                            if (!stockById.has(productId)) {
                                logger.warn(
                                    { uid, productId, orderId },
                                    "[createOrderFromValidatedCart] skipping inventory movement — no locked stock row for product",
                                );
                                return movements;
                            }
                            const stockBefore = Number(stockById.get(productId)) || 0;
                            movements.push({
                                productId,
                                orderId,
                                movementType: "sale",
                                quantityChange: -quantity,
                                stockBefore,
                                stockAfter: Math.max(stockBefore - quantity, 0),
                                note: `Stock deducted for order #${orderId}`,
                                actorId: uid,
                            });
                            return movements;
                        },
                        [],
                    );

                    const cases = productIds.map(() => "WHEN ? THEN ?");
                    const caseValues = productIds.flatMap((productId) => [productId, productQuantities.get(productId)]);

                    // Use one CASE update for all products in the order to keep the
                    // transaction short and reduce lock time. GREATEST(..., 0) guards
                    // against a negative stock value in the rare allowOversell case.
                    logger.debug({ count: productIds.length }, "[createOrderFromValidatedCart] updateProductStock");
                    await q(
                        `UPDATE products
                        SET stock = GREATEST(stock - CASE id ${cases.join(" ")} END, 0)
                        WHERE id IN (${placeholderList})`,
                        [...caseValues, ...productIds],
                    );
                }

                await q("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [uid]);
                logger.debug("[createOrderFromValidatedCart] cart updated");

                await commit();
                // Audit-style side effects happen after commit. A logging failure
                // should not roll back a successfully placed order.
                this.orderTimelineService.recordTimelineEvent({
                    orderId,
                    status: 0,
                    note: "Order was placed by the customer.",
                    actorId: uid,
                });
                this.notificationsService.notifyOrderPlaced(
                    uid,
                    orderId,
                    Number(authoritativeTotalPrice) - Number(discount || 0),
                );
                this.inventoryService.recordMovements(inventoryMovements);
                logger.info({ orderId, ms: Date.now() - startedAt }, "[createOrderFromValidatedCart] commit ok");
                const [order] = await q<Array<{ id: number; date_added: string }>>(
                    `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                    FROM orders
                    WHERE id = ?`,
                    [orderId],
                );
                return order || { id: orderId, date_added: new Date().toISOString() };
            } catch (err) {
                logger.error(err, "[createOrderFromValidatedCart] item processing error");
                try {
                    await rollback();
                } catch (rollbackErr) {
                    logger.error(rollbackErr, "[createOrderFromValidatedCart] rollback failed");
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

    async makePurchase(
        uid: string,
        { totalPrice, cart, discount, shippingAddress, paymentMethod }: PurchasePayload,
    ) {
        logger.info({ uid, items: cart?.length, totalPrice, paymentMethod }, "[makePurchase] start");

        if (!cart || cart.length === 0) {
            throw new Error("Cart is empty");
        }

        const checkoutValidation = await this.cartService.validateCheckoutSubmission(uid, cart, totalPrice);
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
                },
            );
        }
        if (checkoutValidation.mismatches.length > 0) {
            logger.error({
                uid,
                submittedCart: cart,
                submittedTotalPrice: totalPrice,
                mismatches: checkoutValidation.mismatches,
                authoritativeCart: checkoutValidation.cartItems,
                authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            }, "[makePurchase] checkout mismatches");
            throw createCheckoutError(
                "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
                409,
                {
                    mismatches: checkoutValidation.mismatches,
                    authoritativeCart: checkoutValidation.cartItems,
                    authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
                },
            );
        }

        return this.createOrderFromValidatedCart({
            uid,
            authoritativeCart: checkoutValidation.cartItems,
            authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
            discount,
            shippingAddress,
            paymentMethod,
        });
    }

    getOrders(): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrders((err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersPaginated(limit: number, offset: number): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersPaginated(limit, offset, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrdersCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersCount((err: Error | null, results: Array<{ total: number }>) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
            });
        });
    }

    getOrdersByUserId(uid: string): Promise<OrderSummaryRow[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrdersByUserId(uid, (err: Error | null, results: OrderSummaryRow[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderDetail(orderId: number): Promise<(OrderDetail & { timeline?: unknown }) | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderDetail(orderId, (err: Error | null, results: OrderDetailRow[]) => {
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

                this.orderTimelineService
                    .getTimeline(orderId, order)
                    .then((timeline: OrderTimelineRow[]) => resolve({ ...order, timeline }))
                    .catch(() => resolve(order));
            });
        });
    }

    changeOrderStatus(
        orderId: number,
        status: number,
        actorId: string | number | null = null,
    ): Promise<OrderSummaryRow> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.updateOrderStatus(orderId, status, (err: Error | null) => {
                if (err) return reject(err);

                this.ordersRepository.getOrderById(orderId, (findErr: Error | null, results: OrderSummaryRow[]) => {
                    if (findErr) return reject(findErr);
                    if (results.length === 0) return reject(new Error("Order not found"));
                    this.orderTimelineService.recordTimelineEvent({
                        orderId,
                        status,
                        note: `Order status changed to ${status}.`,
                        actorId,
                    });
                    this.notificationsService.notifyOrderStatus(results[0].user_id, orderId, status);
                    resolve(results[0]);
                });
            });
        });
    }

    getOrderItems(): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItems((err: Error | null, results: unknown[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderItemsPaginated(limit: number, offset: number): Promise<unknown[]> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItemsPaginated(limit, offset, (err: Error | null, results: unknown[]) => {
                if (err) return reject(err);
                resolve(results);
            });
        });
    }

    getOrderItemsCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderItemsCount((err: Error | null, results: Array<{ total: number }>) => {
                if (err) return reject(err);
                resolve(results[0]?.total || 0);
            });
        });
    }

    applyDiscount(discountCode: string): Promise<PromotionRow | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.applyDiscount(discountCode, (err: Error | null, results: PromotionRow[]) => {
                if (err) return reject(err);
                if (results.length === 0) {
                    resolve(null);
                    return;
                }
                resolve(results[0]);
            });
        });
    }

    insertPendingCheckout(input: {
        stripeSessionId: string;
        userId: string;
        cartJson: string;
        totalPrice: number;
        discount: number;
        shippingAddress: string;
    }): Promise<void> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.insertPendingCheckout(input, (err: Error | null) => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    getPendingCheckoutBySessionId(stripeSessionId: string): Promise<PendingCheckoutRow | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getPendingCheckoutBySessionId(stripeSessionId, (err: Error | null, results: PendingCheckoutRow[]) => {
                if (err) return reject(err);
                resolve(results[0] || null);
            });
        });
    }

    markPendingCheckoutConsumed(stripeSessionId: string): Promise<number> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.markPendingCheckoutConsumed(stripeSessionId, (err: Error | null, result: UpdateResult) => {
                if (err) return reject(err);
                resolve(result?.affectedRows ?? 0);
            });
        });
    }

    getOrderByStripeSessionId(stripeSessionId: string): Promise<OrderBySessionRow | null> {
        return new Promise((resolve, reject) => {
            this.ordersRepository.getOrderByStripeSessionId(stripeSessionId, (err: Error | null, results: OrderBySessionRow[]) => {
                if (err) return reject(err);
                resolve(results[0] || null);
            });
        });
    }
}
