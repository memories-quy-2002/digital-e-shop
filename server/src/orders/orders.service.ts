import { Injectable } from "@nestjs/common";
import { logger } from "#src/shared/utils/logger";
import type { InsertResult, UpdateResult } from "#src/shared/interfaces/domain";
import type { CartItemRow, CartValidationIssue } from "../cart/cart.types";
import type { InventoryMovementInput } from "../inventory/inventory.dto";
import type { OrderBySessionRow, OrderDetail, OrderDetailRow, OrderItemSnapshot, OrderSummaryRow, OrderTimelineRow, LockedProductRow, PendingCheckoutRow } from "./orders.types";
import type { PromotionRow } from "../promotions/promotions.types";
import type { PurchasePayload } from "./orders.dto";
import { OrdersRepository } from "./orders.repository";
import { NestOrderTimelineService } from "./orders.timeline.service";
import { NestCartService } from "../cart/cart.service";
import { NestInventoryService } from "../inventory/inventory.service";
import { NestNotificationsService } from "../notifications/notifications.service";
import { withTransaction } from "../database/transaction";
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { PromotionsRepository } from "../promotions/promotions.repository";
import { ProductAttributesRepository } from "../products/product-attributes.repository";
import { attributeMapToSnapshot, type ProductAttribute } from "../products/product-attributes.types";

export const createCheckoutError = (message: string, statusCode = 409, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });

const parseSpecificationsSnapshot = (value: unknown): Record<string, unknown> => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    if (typeof value === "string" && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return { raw: value };
        }
        return { raw: value };
    }

    return {};
};

const buildOrderItemSnapshot = (product: CartItemRow, currentAttributes?: ProductAttribute[]): OrderItemSnapshot => {
    const productId = Number(product.product_id || 0);
    const quantity = Number(product.quantity) || 0;
    const unitPrice = product.sale_price !== null && product.sale_price !== undefined
        ? Number(product.sale_price)
        : Number(product.price) || 0;

    const structuredAttributes = attributeMapToSnapshot(currentAttributes);

    return {
        productId,
        sku: String(product.sku || `DIG-${String(productId).padStart(8, "0")}`).trim(),
        productName: String(product.product_name || `Product #${productId}`),
        image: product.main_image ? String(product.main_image) : null,
        unitPrice,
        brand: String(product.brand || ""),
        category: String(product.category || ""),
        warrantyMonths: product.warranty_months === null || product.warranty_months === undefined
            ? null
            : Number(product.warranty_months),
        specifications: Object.keys(structuredAttributes).length > 0
            ? structuredAttributes
            : parseSpecificationsSnapshot(product.specifications),
        quantity,
    };
};

type CreateOrderFromCartInput = {
    uid: string;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
    discountCode?: string;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
};

@Injectable()
export class NestOrdersService {
    constructor(
        private readonly ordersRepository: OrdersRepository,
        private readonly orderTimelineService: NestOrderTimelineService,
        private readonly cartService: NestCartService,
        private readonly inventoryService: NestInventoryService,
        private readonly notificationsService: NestNotificationsService,
        private readonly checkoutReservationRepository: CheckoutReservationRepository,
        private readonly promotionsRepository: PromotionsRepository,
        private readonly productAttributesRepository: ProductAttributesRepository,
    ) {}

    async createOrderFromValidatedCart({
        uid,
        authoritativeCart,
        authoritativeTotalPrice,
        discount,
        shippingAddress,
        paymentMethod,
        discountCode,
        stripeCheckoutSessionId = null,
        stripePaymentIntentId = null,
    }: CreateOrderFromCartInput): Promise<{ id: number; date_added: string }> {
        const startedAt = Date.now();
        const requestedDiscount = discountCode ? Number(discount) || 0 : 0;
        logger.info({ uid, items: authoritativeCart?.length, authoritativeTotalPrice, paymentMethod }, "[createOrderFromValidatedCart] start");

        const transactionResult = await withTransaction(async (tx) => {
            const q = <T = unknown>(sql: string, values?: unknown[]) => tx.query<T>(sql, values);
            logger.debug("[createOrderFromValidatedCart] transaction started");

            const orderResult = await q<InsertResult>(
                "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, stripe_checkout_session_id, stripe_payment_intent_id, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                [uid, authoritativeTotalPrice, requestedDiscount, shippingAddress, paymentMethod, stripeCheckoutSessionId, stripePaymentIntentId],
            );
            const orderId = orderResult.insertId;
            logger.debug({ orderId }, "[createOrderFromValidatedCart] order inserted");

            let appliedDiscount = requestedDiscount;
            if (discountCode) {
                const promotion = await this.promotionsRepository.consumePromotion(
                    tx,
                    discountCode,
                    uid,
                    orderId,
                    authoritativeTotalPrice,
                );
                appliedDiscount = promotion.discount;
                if (appliedDiscount !== requestedDiscount) {
                    await q("UPDATE orders SET discount = ? WHERE id = ?", [appliedDiscount, orderId]);
                }
            }

            const productIdsForSnapshot = [...new Set(authoritativeCart.map((item) => Number(item.product_id || 0)).filter(Boolean))];
            const productAttributes = await this.productAttributesRepository.getForProducts(tx, productIdsForSnapshot);
            const orderItemSnapshots = authoritativeCart.map((item) =>
                buildOrderItemSnapshot(item, productAttributes.get(Number(item.product_id || 0))),
            );
            const orderItemsValues = orderItemSnapshots.map((snapshot) => [
                orderId,
                snapshot.productId,
                snapshot.quantity,
                snapshot.unitPrice * snapshot.quantity,
                snapshot.sku,
                snapshot.productName,
                snapshot.image,
                snapshot.unitPrice,
                snapshot.brand,
                snapshot.category,
                snapshot.warrantyMonths,
                JSON.stringify(snapshot.specifications),
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
                await q(
                    `INSERT INTO order_items
                        (order_id, product_id, quantity, total_price, sku_snapshot, product_name_snapshot,
                         image_snapshot, unit_price_snapshot, brand_snapshot, category_snapshot,
                         warranty_months_snapshot, specifications_snapshot)
                     VALUES ?`,
                    [orderItemsValues],
                );

                const productIds = [...productQuantities.keys()].sort((left, right) => left - right);
                const placeholderList = productIds.map(() => "?").join(", ");
                const authoritativeItemsById = new Map(
                    authoritativeCart.map((item: CartItemRow) => [Number(item.product_id || 0), item] as const),
                );

                const lockedProducts = await q<LockedProductRow[]>(
                    `SELECT id, name, stock FROM products WHERE id IN (${placeholderList}) AND stock >= 0 FOR UPDATE`,
                    productIds,
                );

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
                            { issues, authoritativeCart, authoritativeTotalPrice },
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
                            { issues, authoritativeCart, authoritativeTotalPrice },
                        );
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

                logger.debug({ count: productIds.length }, "[createOrderFromValidatedCart] updateProductStock");
                for (const productId of productIds) {
                    const quantity = productQuantities.get(productId) || 0;
                    const result = await q<{ affectedRows: number }>(
                        "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
                        [quantity, productId, quantity],
                    );
                    if (result.affectedRows !== 1) {
                        throw createCheckoutError("Stock changed while placing the order. Please try again.", 409);
                    }
                }
                await this.inventoryService.createMovementsInTransaction(tx, inventoryMovements);
            }

            await q("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [uid]);
            logger.debug("[createOrderFromValidatedCart] cart updated");
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId,
                status: 0,
                note: "Order was placed by the customer.",
                actorId: uid,
            });

            const [order] = await q<Array<{ id: number; date_added: string }>>(
                `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                FROM orders
                WHERE id = ?`,
                [orderId],
            );
            return {
                orderId,
                inventoryMovements,
                appliedDiscount,
                order: order || { id: orderId, date_added: new Date().toISOString() },
            };
        });

        this.notificationsService.notifyOrderPlaced(
            uid,
            transactionResult.orderId,
            Number(authoritativeTotalPrice) - Number(transactionResult.appliedDiscount || 0),
        );
        logger.info({ orderId: transactionResult.orderId, ms: Date.now() - startedAt }, "[createOrderFromValidatedCart] commit ok");
        return transactionResult.order;
    }

    async makePurchase(
        uid: string,
        { totalPrice, cart, discount, discountCode, shippingAddress, paymentMethod }: PurchasePayload,
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
            discountCode,
            shippingAddress,
            paymentMethod,
        });
    }

    async finalizeReservedCheckout(
        stripeSessionId: string,
        stripePaymentIntentId: string | null,
    ): Promise<{ id: number; date_added: string } | null> {
        const transactionResult = await withTransaction(async (tx) => {
            const pending = await this.checkoutReservationRepository.getPendingCheckoutForUpdate(tx, stripeSessionId);
            if (!pending) return null;

            const [existingOrder] = await tx.query<Array<{ id: number; date_added: string }>>(
                `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                 FROM orders WHERE stripe_checkout_session_id = ? LIMIT 1`,
                [stripeSessionId],
            );
            if (existingOrder) {
                if (pending.status === "PENDING" && !pending.consumed_at) {
                    if (pending.discount_id) {
                        const consumedRows = await this.promotionsRepository.consumePromotionReservation(tx, pending.id, existingOrder.id);
                        if (consumedRows !== 1) {
                            throw createCheckoutError("Promotion reservation was already finalized.", 409);
                        }
                    }
                    await this.checkoutReservationRepository.consumeReservation(tx, pending.id);
                }
                return {
                    orderId: existingOrder.id,
                    userId: pending.user_id,
                    payableAmount: Number(pending.total_price) - Number(pending.discount),
                    alreadyProcessed: true,
                    order: existingOrder,
                };
            }
            const reservationExpired = !pending.expires_at || new Date(pending.expires_at).getTime() <= Date.now();
            if (pending.status !== "PENDING" || pending.consumed_at || reservationExpired) {
                throw createCheckoutError("Checkout reservation is no longer payable.", 409);
            }

            let authoritativeCart: CartItemRow[];
            try {
                authoritativeCart = JSON.parse(pending.cart_json) as CartItemRow[];
            } catch (error) {
                throw createCheckoutError("Checkout reservation contains invalid cart data.", 500, { cause: String(error) });
            }

            const reservationItems = await this.checkoutReservationRepository.getReservationItems(tx, pending.id);
            if (reservationItems.length === 0) {
                throw createCheckoutError("Checkout reservation has no inventory items.", 409);
            }
            const productIds = reservationItems.map((item) => item.productId).sort((left, right) => left - right);
            const lockedProducts = await this.checkoutReservationRepository.lockProducts(tx, productIds);
            const stockById = new Map(lockedProducts.map((product) => [product.id, Number(product.stock) || 0]));
            const cartItemById = new Map(
                authoritativeCart.map((item) => [Number(item.product_id || 0), item] as const),
            );
            for (const item of reservationItems) {
                const stock = stockById.get(item.productId);
                if (stock == null || stock < item.quantity) {
                    const productName = String(cartItemById.get(item.productId)?.product_name || `Product #${item.productId}`);
                    throw createCheckoutError(
                        `${productName} no longer has enough stock to complete this paid order.`,
                        409,
                        { productId: item.productId, requestedQuantity: item.quantity, availableStock: stock ?? 0 },
                    );
                }
            }

            const orderResult = await tx.query<InsertResult>(
                "INSERT INTO orders (user_id, total_price, discount, shipping_address, payment_method, stripe_checkout_session_id, stripe_payment_intent_id, date_added) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())",
                [
                    pending.user_id,
                    Number(pending.total_price),
                    Number(pending.discount),
                    pending.shipping_address,
                    "card",
                    stripeSessionId,
                    stripePaymentIntentId,
                ],
            );
            const orderId = orderResult.insertId;
            if (pending.discount_id) {
                const consumedRows = await this.promotionsRepository.consumePromotionReservation(tx, pending.id, orderId);
                if (consumedRows !== 1) {
                    throw createCheckoutError("Promotion reservation was already finalized.", 409);
                }
            }
            const productAttributes = await this.productAttributesRepository.getForProducts(tx, productIds);
            const orderItemSnapshots = authoritativeCart.map((item) =>
                buildOrderItemSnapshot(item, productAttributes.get(Number(item.product_id || 0))),
            );
            const orderItemsValues = orderItemSnapshots.map((snapshot) => [
                orderId,
                snapshot.productId,
                snapshot.quantity,
                snapshot.unitPrice * snapshot.quantity,
                snapshot.sku,
                snapshot.productName,
                snapshot.image,
                snapshot.unitPrice,
                snapshot.brand,
                snapshot.category,
                snapshot.warrantyMonths,
                JSON.stringify(snapshot.specifications),
            ]);
            if (orderItemsValues.length > 0) {
                await tx.query(
                    `INSERT INTO order_items
                        (order_id, product_id, quantity, total_price, sku_snapshot, product_name_snapshot,
                         image_snapshot, unit_price_snapshot, brand_snapshot, category_snapshot,
                         warranty_months_snapshot, specifications_snapshot)
                     VALUES ?`,
                    [orderItemsValues],
                );
            }

            const inventoryMovements: InventoryMovementInput[] = [];
            for (const item of reservationItems) {
                const stockBefore = stockById.get(item.productId) || 0;
                const result = await tx.query<{ affectedRows: number }>(
                    "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
                    [item.quantity, item.productId, item.quantity],
                );
                if (result.affectedRows !== 1) {
                    throw createCheckoutError("Stock changed while confirming payment. The order was not created.", 409);
                }
                inventoryMovements.push({
                    productId: item.productId,
                    orderId,
                    movementType: "sale",
                    quantityChange: -item.quantity,
                    stockBefore,
                    stockAfter: stockBefore - item.quantity,
                    note: `Stock deducted for order #${orderId}`,
                    actorId: pending.user_id,
                });
            }
            await this.inventoryService.createMovementsInTransaction(tx, inventoryMovements);
            await tx.query("UPDATE carts SET done = 1 WHERE user_id = ? AND done = 0", [pending.user_id]);

            const consumedRows = await this.checkoutReservationRepository.consumeReservation(tx, pending.id);
            if (consumedRows !== 1) {
                throw createCheckoutError("Checkout reservation was already finalized.", 409);
            }
            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId,
                status: 0,
                note: "Order was placed by the customer.",
                actorId: pending.user_id,
            });
            const [order] = await tx.query<Array<{ id: number; date_added: string }>>(
                `SELECT id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added
                 FROM orders WHERE id = ?`,
                [orderId],
            );
            return {
                orderId,
                userId: pending.user_id,
                payableAmount: Number(pending.total_price) - Number(pending.discount),
                alreadyProcessed: false,
                order: order || { id: orderId, date_added: new Date().toISOString() },
            };
        });

        if (!transactionResult) return null;
        if (transactionResult.alreadyProcessed) return transactionResult.order;
        this.notificationsService.notifyOrderPlaced(
            transactionResult.userId,
            transactionResult.orderId,
            transactionResult.payableAmount,
        );
        return transactionResult.order;
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
                            sku: row.sku,
                            productName: row.product_name,
                            category: row.category,
                            brand: row.brand,
                            warrantyMonths: row.warranty_months === null || row.warranty_months === undefined
                                ? null
                                : Number(row.warranty_months),
                            specifications: row.specifications,
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
        return withTransaction(async (tx) => {
            const result = await tx.query<UpdateResult>("UPDATE orders SET status = ? WHERE id = ?", [status, orderId]);
            if (result.affectedRows === 0) {
                throw new Error("Order not found");
            }

            const [orderOwner] = await tx.query<Array<{ user_id: string }>>(
                "SELECT user_id FROM orders WHERE id = ?",
                [orderId],
            );
            if (!orderOwner) {
                throw new Error("Order not found");
            }

            await this.orderTimelineService.createTimelineEventInTransaction(tx, {
                orderId,
                status,
                note: `Order status changed to ${status}.`,
                actorId,
            });
            return orderOwner;
        }).then((orderOwner) => new Promise<OrderSummaryRow>((resolve, reject) => {
            this.ordersRepository.getOrderById(orderId, (error: Error | null, rows: OrderSummaryRow[]) => {
                if (error) return reject(error);
                if (!rows[0]) return reject(new Error("Order not found"));
                this.notificationsService.notifyOrderStatus(orderOwner.user_id, orderId, status);
                resolve(rows[0]);
            });
        }));
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

    markPendingCheckoutExpired(stripeSessionId: string): Promise<number> {
        return withTransaction(async (tx) => {
            const pending = await this.checkoutReservationRepository.getPendingCheckoutForUpdate(tx, stripeSessionId);
            if (!pending) return 0;
            const affectedRows = await this.checkoutReservationRepository.expireReservationBySession(tx, stripeSessionId);
            if (pending.discount_id) {
                await this.promotionsRepository.releasePromotionReservation(tx, pending.id);
            }
            return affectedRows;
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
