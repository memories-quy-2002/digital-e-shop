const path = require("path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const {
    assertExplicitDemoSeedTarget,
    assertLocalDatabaseTarget,
    DESTRUCTIVE_DEMO_SEED_MODE,
} = require("../../config/database-target");
const { resolveDemoDatabaseSsl } = require("./database-ssl.js");
const {
    DEMO_PASSWORD,
    DEMO_SEED_PLAN,
    DEMO_SEED_MIN_PRICE_VND,
    validateDemoSeedPlan,
} = require("./demo-seed-data");
const { resolveDemoSeedPlan } = require("./demo-firebase-identities");
const { USER_ACCOUNT_STATUS } = require("./constants.js");

const LOOKUP_TABLES = new Set(["categories", "brands"]);
const DEMO_ORDER_EVENT_NOTE_PREFIX = "Digital-E demo seed order%";
const DEMO_NOTIFICATION_PREFIX = "Demo";
const DEMO_MOVEMENT_PREFIX = "Digital-E demo seed";
const LEGACY_PRODUCT_NAME_PATTERNS = ["%e2e%", "%demo%"];
const LEGACY_TEST_ACCOUNT_EMAIL_PATTERN = "test%@gmail.com";

const assertDemoSeedTarget = () => {
    if (process.env.DEMO_SEED_MODE === DESTRUCTIVE_DEMO_SEED_MODE) {
        assertExplicitDemoSeedTarget({
            dbHost: process.env.DB_HOST,
            databaseUrl: process.env.DATABASE_URL,
            mode: process.env.DEMO_SEED_MODE,
            confirmation: process.env.DEMO_SEED_CONFIRMATION,
            allowRemoteDatabase: process.env.ALLOW_DESTRUCTIVE_DEMO_SEED === "true",
        });
        return;
    }

    assertLocalDatabaseTarget({
        dbHost: process.env.DB_HOST,
        databaseUrl: process.env.DATABASE_URL,
    });
};

const roundMoney = (value) => Number(Number(value).toFixed(2));

const dateDaysAgo = (daysAgo, hour = 10) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(hour, (daysAgo * 7) % 60, 0, 0);
    return date.toISOString().slice(0, 19).replace("T", " ");
};

const query = (connection, sql, params = []) => connection.query(sql, params).then(([rows]) => rows);

const asInsertId = (result) => Number(result.insertId);
const demoProductSku = (index) => `DEMO-${String(index + 1).padStart(4, "0")}`;

const ensureLookupId = async (connection, tableName, name) => {
    if (!LOOKUP_TABLES.has(tableName)) {
        throw new Error(`Unsupported demo lookup table: ${tableName}`);
    }

    const existing = await query(connection, `SELECT id FROM ${tableName} WHERE name = ? ORDER BY id LIMIT 1`, [name]);
    if (existing[0]) {
        return Number(existing[0].id);
    }

    const result = await connection.query(`INSERT INTO ${tableName} (name) VALUES (?)`, [name]);
    return asInsertId(result[0]);
};

const upsertDemoUsers = async (connection, plan, passwordHash) => {
    const userIds = new Map();

    for (const [index, user] of plan.users.entries()) {
        await connection.query(
            `INSERT INTO users
                (id, username, email, password, role, token, first_name, last_name, status, auth_provider, provider_user_id, email_verified_at, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, '', ?, ?, '${USER_ACCOUNT_STATUS.ACTIVE}', ?, ?, IF(?, UTC_TIMESTAMP(), NULL), ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                email = VALUES(email),
                password = VALUES(password),
                role = VALUES(role),
                token = '',
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                status = '${USER_ACCOUNT_STATUS.ACTIVE}',
                auth_provider = VALUES(auth_provider),
                provider_user_id = VALUES(provider_user_id),
                email_verified_at = VALUES(email_verified_at)`,
            [
                user.id,
                user.username,
                user.email,
                passwordHash,
                user.role,
                user.firstName,
                user.lastName,
                user.authProvider,
                user.providerUserId,
                user.emailVerified,
                dateDaysAgo(30 - index),
                dateDaysAgo(1, 8 + index),
            ],
        );
        userIds.set(user.key, user.id);
    }

    return userIds;
};

const upsertDemoProducts = async (connection, plan) => {
    const categoryIds = new Map();
    const brandIds = new Map();
    const productIds = new Map();

    for (const categoryName of plan.categories) {
        categoryIds.set(categoryName, await ensureLookupId(connection, "categories", categoryName));
    }

    for (const brandName of plan.brands) {
        brandIds.set(brandName, await ensureLookupId(connection, "brands", brandName));
    }

    for (const [index, product] of plan.products.entries()) {
        const categoryId = categoryIds.get(product.categoryName);
        const brandId = brandIds.get(product.brandName);
        const sku = demoProductSku(index);
        const existing = await query(connection, "SELECT id FROM products WHERE name = ? ORDER BY id LIMIT 1", [product.name]);

        if (existing[0]) {
            const productId = Number(existing[0].id);
            const stockOperations = await query(
                connection,
                `SELECT EXISTS(SELECT 1 FROM purchase_order_items WHERE product_id = ?)
                    OR EXISTS(SELECT 1 FROM stock_count_items WHERE product_id = ?) AS has_stock_operations`,
                [productId, productId],
            );
            const shouldSeedStock = Number(stockOperations[0]?.has_stock_operations) !== 1;
            await connection.query(
                `UPDATE products
                SET description = ?, category_id = ?, brand_id = ?, price = ?, sale_price = ?,
                    stock_revision = stock_revision + IF(? = 1 AND stock <> ?, 1, 0),
                    stock = IF(? = 1, ?, stock), main_image = ?, specifications = ?, sku = ?, updated_at = UTC_TIMESTAMP()
                WHERE id = ?`,
                [
                    product.description,
                    categoryId,
                    brandId,
                    product.price,
                    product.salePrice,
                    shouldSeedStock ? 1 : 0,
                    product.stock,
                    shouldSeedStock ? 1 : 0,
                    product.stock,
                    product.mainImage,
                    product.specifications,
                    sku,
                    productId,
                ],
            );
            productIds.set(product.name, productId);
            continue;
        }

        const result = await connection.query(
            `INSERT INTO products
                (name, description, category_id, brand_id, price, sale_price, stock, main_image, specifications, sku, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
            [
                product.name,
                product.description,
                categoryId,
                brandId,
                product.price,
                product.salePrice,
                product.stock,
                product.mainImage,
                product.specifications,
                sku,
            ],
        );
        productIds.set(product.name, asInsertId(result[0]));
    }

    return { categoryIds, brandIds, productIds };
};

const findDemoOrderIds = async (connection, userIds) => {
    const rows = await query(
        connection,
        `SELECT DISTINCT o.id
         FROM orders o
         JOIN order_status_events ose ON ose.order_id = o.id
         WHERE o.user_id IN (?) AND ose.note LIKE ?`,
        [Array.from(userIds.values()), DEMO_ORDER_EVENT_NOTE_PREFIX],
    );
    return rows.map((row) => Number(row.id));
};

const findDemoCartIds = async (connection, userIds) => {
    const rows = await query(connection, "SELECT id FROM carts WHERE user_id IN (?)", [Array.from(userIds.values())]);
    return rows.map((row) => Number(row.id));
};

const deleteByIds = async (connection, tableName, columnName, ids) => {
    if (ids.length === 0) {
        return;
    }
    await connection.query(`DELETE FROM ${tableName} WHERE ${columnName} IN (?)`, [ids]);
};

const clearDemoRows = async (connection, plan, userIds, productIds) => {
    const userIdValues = Array.from(userIds.values());
    const productIdValues = Array.from(productIds.values());
    const orderIds = await findDemoOrderIds(connection, userIds);
    const cartIds = await findDemoCartIds(connection, userIds);

    await deleteByIds(connection, "inventory_movements", "order_id", orderIds);
    await connection.query("DELETE FROM inventory_movements WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX}%`]);
    await deleteByIds(connection, "order_status_events", "order_id", orderIds);
    await connection.query("DELETE FROM order_status_events WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX} order%`]);
    await deleteByIds(connection, "order_payments", "order_id", orderIds);
    await deleteByIds(connection, "discount_redemptions", "order_id", orderIds);
    await deleteByIds(connection, "support_tickets", "order_id", orderIds);
    await deleteByIds(connection, "order_items", "order_id", orderIds);
    await deleteByIds(connection, "cart_items", "cart_id", cartIds);
    const demoDiscountCodes = plan.discounts.map((discount) => discount.code);
    await connection.query(
        `DELETE ir
         FROM inventory_reservations ir
         JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
         JOIN discounts d ON d.id = pc.discount_id
         WHERE d.discount_code IN (?)`,
        [demoDiscountCodes],
    );
    await connection.query(
        `DELETE dr
         FROM discount_redemptions dr
         JOIN pending_checkouts pc ON pc.id = dr.pending_checkout_id
         JOIN discounts d ON d.id = pc.discount_id
         WHERE d.discount_code IN (?)`,
        [demoDiscountCodes],
    );
    await connection.query(
        `DELETE pc
         FROM pending_checkouts pc
         JOIN discounts d ON d.id = pc.discount_id
         WHERE d.discount_code IN (?)`,
        [demoDiscountCodes],
    );
    await connection.query(
        `DELETE dr
         FROM discount_redemptions dr
         JOIN discounts d ON d.id = dr.discount_id
         WHERE d.discount_code IN (?)`,
        [demoDiscountCodes],
    );
    await connection.query("DELETE FROM reviews WHERE user_id IN (?) AND product_id IN (?)", [userIdValues, productIdValues]);
    await connection.query("DELETE FROM wishlist WHERE user_id IN (?) AND product_id IN (?)", [userIdValues, productIdValues]);
    await connection.query(
        "DELETE FROM customer_notifications WHERE user_id IN (?) AND title LIKE ?",
        [userIdValues, `${DEMO_NOTIFICATION_PREFIX}%`],
    );
    await connection.query("DELETE FROM customer_sessions WHERE user_id IN (?)", [userIdValues]);
    await connection.query("DELETE FROM customer_addresses WHERE user_id IN (?)", [userIdValues]);
    await deleteByIds(connection, "orders", "id", orderIds);
    await deleteByIds(connection, "carts", "id", cartIds);
    await connection.query("DELETE FROM discounts WHERE discount_code IN (?)", [demoDiscountCodes]);
};

const clearOrdersContainingProducts = async (connection, productIds, managedProductIds, currency) => {
    const [invalidProductOrders, protectedProductOrders, legacyCurrencyOrders] = await Promise.all([
        productIds.length > 0
            ? query(
                connection,
                `SELECT DISTINCT o.id
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 LEFT JOIN users u ON u.id = o.user_id
                 WHERE oi.product_id IN (?) AND u.email LIKE ?`,
                [productIds, LEGACY_TEST_ACCOUNT_EMAIL_PATTERN],
            )
            : Promise.resolve([]),
        productIds.length > 0
            ? query(
                connection,
                `SELECT DISTINCT o.id
                 FROM orders o
                 JOIN order_items oi ON oi.order_id = o.id
                 LEFT JOIN users u ON u.id = o.user_id
                 WHERE oi.product_id IN (?) AND (u.email IS NULL OR u.email NOT LIKE ?)`,
                [productIds, LEGACY_TEST_ACCOUNT_EMAIL_PATTERN],
            )
            : Promise.resolve([]),
        query(
            connection,
            `SELECT DISTINCT o.id
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id
             JOIN users u ON u.id = o.user_id
             WHERE oi.product_id IN (?) AND o.currency <> ? AND u.email LIKE ?`,
            [managedProductIds, currency, LEGACY_TEST_ACCOUNT_EMAIL_PATTERN],
        ),
    ]);

    if (protectedProductOrders.length > 0) {
        throw new Error(
            `Refusing to remove low-price catalog products referenced by ${protectedProductOrders.length} non-test order(s). Preserve customer order history first.`,
        );
    }

    const orderIds = Array.from(new Set([...invalidProductOrders, ...legacyCurrencyOrders].map((row) => Number(row.id))));

    if (orderIds.length === 0) {
        return 0;
    }

    const [afterSaleRequests, codSettlements, deliveryAssignments, loyaltyVouchers, orderPayments, paymentAttempts, shipments] = await Promise.all([
        query(connection, "SELECT id FROM after_sales_requests WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM cod_settlements WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM delivery_assignments WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM loyalty_vouchers WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM order_payments WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM payment_attempts WHERE order_id IN (?)", [orderIds]),
        query(connection, "SELECT id FROM shipments WHERE order_id IN (?)", [orderIds]),
    ]);
    const afterSaleRequestIds = afterSaleRequests.map((row) => Number(row.id));
    const codSettlementIds = codSettlements.map((row) => Number(row.id));
    const deliveryAssignmentIds = deliveryAssignments.map((row) => Number(row.id));
    const loyaltyVoucherIds = loyaltyVouchers.map((row) => Number(row.id));
    const orderPaymentIds = orderPayments.map((row) => Number(row.id));
    const paymentAttemptIds = paymentAttempts.map((row) => Number(row.id));
    const shipmentIds = shipments.map((row) => Number(row.id));

    const refundOperations = await query(
        connection,
        `SELECT id FROM manual_refund_operations
         WHERE request_id IN (SELECT id FROM after_sales_requests WHERE order_id IN (?))
            OR order_payment_id IN (SELECT id FROM order_payments WHERE order_id IN (?))`,
        [orderIds, orderIds],
    );
    const refundOperationIds = refundOperations.map((row) => Number(row.id));
    const notificationLinks = orderIds.map((orderId) => `/orders?order=${orderId}`);

    await connection.query("DELETE FROM customer_notifications WHERE link IN (?)", [notificationLinks]);
    await deleteByIds(connection, "after_sales_events", "request_id", afterSaleRequestIds);
    await deleteByIds(connection, "after_sales_items", "request_id", afterSaleRequestIds);
    await deleteByIds(connection, "manual_refund_units", "operation_id", refundOperationIds);
    await deleteByIds(connection, "manual_refund_operations", "id", refundOperationIds);
    await deleteByIds(connection, "after_sales_requests", "id", afterSaleRequestIds);
    await deleteByIds(connection, "cod_settlement_events", "settlement_id", codSettlementIds);
    await deleteByIds(connection, "cod_settlements", "id", codSettlementIds);
    await deleteByIds(connection, "delivery_events", "assignment_id", deliveryAssignmentIds);
    await deleteByIds(connection, "delivery_events", "order_id", orderIds);
    await deleteByIds(connection, "delivery_assignments", "id", deliveryAssignmentIds);
    await deleteByIds(connection, "discount_redemptions", "order_id", orderIds);
    await deleteByIds(connection, "loyalty_ledger", "order_id", orderIds);
    await deleteByIds(connection, "loyalty_ledger", "voucher_id", loyaltyVoucherIds);
    await deleteByIds(connection, "loyalty_vouchers", "id", loyaltyVoucherIds);
    await deleteByIds(connection, "order_status_events", "order_id", orderIds);
    await deleteByIds(connection, "inventory_movements", "order_id", orderIds);
    await deleteByIds(connection, "payment_reconciliation_attempts", "order_payment_id", orderPaymentIds);
    await deleteByIds(connection, "payment_attempt_observations", "attempt_id", paymentAttemptIds);
    await deleteByIds(connection, "payment_attempt_refunds", "attempt_id", paymentAttemptIds);
    await deleteByIds(connection, "manual_refund_operations", "order_payment_id", orderPaymentIds);
    await deleteByIds(connection, "payment_attempts", "id", paymentAttemptIds);
    await deleteByIds(connection, "order_payments", "id", orderPaymentIds);
    await deleteByIds(connection, "shipment_events", "shipment_id", shipmentIds);
    await deleteByIds(connection, "shipments", "id", shipmentIds);
    await deleteByIds(connection, "support_tickets", "order_id", orderIds);
    await deleteByIds(connection, "order_items", "order_id", orderIds);
    await deleteByIds(connection, "orders", "id", orderIds);

    return orderIds.length;
};

const clearPendingCheckoutsContainingProducts = async (connection, productIds) => {
    if (productIds.length === 0) {
        return 0;
    }

    const [testCheckoutRows, protectedCheckoutRows] = await Promise.all([
        query(
            connection,
            `SELECT DISTINCT pc.id
             FROM pending_checkouts pc
             JOIN inventory_reservations ir ON ir.pending_checkout_id = pc.id
             JOIN users u ON u.id = pc.user_id
             WHERE ir.product_id IN (?) AND u.email LIKE ?`,
            [productIds, LEGACY_TEST_ACCOUNT_EMAIL_PATTERN],
        ),
        query(
            connection,
            `SELECT DISTINCT pc.id
             FROM pending_checkouts pc
             JOIN inventory_reservations ir ON ir.pending_checkout_id = pc.id
             LEFT JOIN users u ON u.id = pc.user_id
             WHERE ir.product_id IN (?) AND (u.email IS NULL OR u.email NOT LIKE ?)`,
            [productIds, LEGACY_TEST_ACCOUNT_EMAIL_PATTERN],
        ),
    ]);
    if (protectedCheckoutRows.length > 0) {
        throw new Error(
            `Refusing to remove low-price catalog products referenced by ${protectedCheckoutRows.length} non-test pending checkout(s). Preserve customer checkout state first.`,
        );
    }

    const pendingCheckoutIds = testCheckoutRows.map((row) => Number(row.id));
    if (pendingCheckoutIds.length === 0) {
        return 0;
    }

    const [loyaltyVouchers, paymentAttempts] = await Promise.all([
        query(connection, "SELECT id FROM loyalty_vouchers WHERE pending_checkout_id IN (?)", [pendingCheckoutIds]),
        query(connection, "SELECT id FROM payment_attempts WHERE pending_checkout_id IN (?)", [pendingCheckoutIds]),
    ]);
    const loyaltyVoucherIds = loyaltyVouchers.map((row) => Number(row.id));
    const paymentAttemptIds = paymentAttempts.map((row) => Number(row.id));

    await deleteByIds(connection, "payment_attempt_observations", "attempt_id", paymentAttemptIds);
    await deleteByIds(connection, "payment_attempt_refunds", "attempt_id", paymentAttemptIds);
    await deleteByIds(connection, "payment_attempts", "id", paymentAttemptIds);
    await deleteByIds(connection, "payment_reconciliation_attempts", "pending_checkout_id", pendingCheckoutIds);
    await deleteByIds(connection, "discount_redemptions", "pending_checkout_id", pendingCheckoutIds);
    await deleteByIds(connection, "loyalty_ledger", "pending_checkout_id", pendingCheckoutIds);
    await deleteByIds(connection, "loyalty_ledger", "voucher_id", loyaltyVoucherIds);
    await deleteByIds(connection, "loyalty_vouchers", "id", loyaltyVoucherIds);
    await deleteByIds(connection, "inventory_reservations", "pending_checkout_id", pendingCheckoutIds);
    await deleteByIds(connection, "pending_checkouts", "id", pendingCheckoutIds);

    return pendingCheckoutIds.length;
};

const clearLegacyCatalogProducts = async (connection, managedProductIds) => {
    const rows = await query(
        connection,
        `SELECT id FROM products
         WHERE LOWER(name) LIKE ? OR LOWER(name) LIKE ?
            OR price < ? OR (sale_price IS NOT NULL AND sale_price < ?)`,
        [...LEGACY_PRODUCT_NAME_PATTERNS, DEMO_SEED_MIN_PRICE_VND, DEMO_SEED_MIN_PRICE_VND],
    );
    const candidateProductIds = rows.map((row) => Number(row.id));
    if (candidateProductIds.length === 0) {
        return { products: 0, orders: 0, checkouts: 0 };
    }
    const referencedProducts = await query(
        connection,
        `SELECT product_id FROM purchase_order_items WHERE product_id IN (?)
         UNION
         SELECT product_id FROM stock_count_items WHERE product_id IN (?)`,
        [candidateProductIds, candidateProductIds],
    );
    const referencedProductIds = new Set(referencedProducts.map((row) => Number(row.product_id)));
    // Retain products with operator procurement or count history so demo cleanup
    // cannot erase those documents or leave their foreign keys orphaned.
    const productIds = candidateProductIds.filter((id) => !referencedProductIds.has(id));
    const removedCheckouts = await clearPendingCheckoutsContainingProducts(connection, productIds);
    const ordersRemoved = await clearOrdersContainingProducts(connection, productIds, managedProductIds, DEMO_SEED_PLAN.currency);
    if (productIds.length === 0) {
        return { products: 0, orders: ordersRemoved, checkouts: removedCheckouts };
    }
    const alertEvents = await query(connection, "SELECT id FROM product_alert_events WHERE product_id IN (?)", [productIds]);
    const alertEventIds = alertEvents.map((row) => Number(row.id));

    await deleteByIds(connection, "customer_notifications", "alert_event_id", alertEventIds);
    await deleteByIds(connection, "inventory_movements", "product_id", productIds);
    await deleteByIds(connection, "product_attributes", "product_id", productIds);
    await deleteByIds(connection, "inventory_reservations", "product_id", productIds);
    await deleteByIds(connection, "cart_items", "product_id", productIds);
    await deleteByIds(connection, "guest_cart_items", "product_id", productIds);
    await deleteByIds(connection, "product_alert_events", "id", alertEventIds);
    await deleteByIds(connection, "product_alert_subscriptions", "product_id", productIds);
    await deleteByIds(connection, "reviews", "product_id", productIds);
    await deleteByIds(connection, "wishlist", "product_id", productIds);
    await deleteByIds(connection, "products", "id", productIds);

    return { products: productIds.length, orders: ordersRemoved, checkouts: removedCheckouts };
};

const seedAddresses = async (connection, plan, userIds) => {
    for (const address of plan.addresses) {
        await connection.query(
            `INSERT INTO customer_addresses
                (user_id, label, recipient_name, phone_number, address_line, city, country, is_default)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userIds.get(address.userKey),
                address.label,
                address.recipientName,
                address.phoneNumber,
                address.addressLine,
                address.city,
                address.country,
                address.label === "Home" ? 1 : 0,
            ],
        );
    }
};

const seedCarts = async (connection, plan, userIds, productIds) => {
    const cartIds = new Map();

    for (const cart of plan.carts) {
        const result = await connection.query(
            "INSERT INTO carts (user_id, created_at, done) VALUES (?, ?, ?)",
            [userIds.get(cart.userKey), dateDaysAgo(2), cart.done],
        );
        const cartId = asInsertId(result[0]);
        cartIds.set(cart.key, cartId);

        for (const item of cart.items) {
            await connection.query(
                "INSERT INTO cart_items (cart_id, product_id, quantity, created_at) VALUES (?, ?, ?, ?)",
                [cartId, productIds.get(item.productName), item.quantity, dateDaysAgo(1)],
            );
        }
    }

    return cartIds;
};

const seedOrders = async (connection, plan, userIds, productIds, productDefinitions) => {
    const orderIds = new Map();
    const stockByProductId = new Map(productDefinitions.map((product) => [productIds.get(product.name), product.stock]));
    const adminId = userIds.get("admin");
    const shippingAddressByUser = new Map();

    for (const address of plan.addresses) {
        if (!shippingAddressByUser.has(address.userKey) || address.label === "Home") {
            shippingAddressByUser.set(
                address.userKey,
                `${address.recipientName}, ${address.addressLine}, ${address.city}, ${address.country}`,
            );
        }
    }

    for (const [index, order] of plan.orders.entries()) {
        const placedDaysAgo = plan.orders.length + 2 - index;
        const placedAt = dateDaysAgo(placedDaysAgo, 9 + (index % 6));
        const orderItems = order.items.map((item) => {
            const product = productDefinitions.find((definition) => definition.name === item.productName);
            const unitPrice = Number(product.salePrice ?? product.price);
            const totalPrice = roundMoney(unitPrice * item.quantity);
            return {
                ...item,
                productId: productIds.get(item.productName),
                totalPrice,
            };
        });
        const grossTotal = roundMoney(orderItems.reduce((sum, item) => sum + item.totalPrice, 0));
        const discount = roundMoney((grossTotal * order.discountRate) / 100);
        const customerId = userIds.get(order.userKey);
        const result = await connection.query(
            `INSERT INTO orders
                (user_id, total_price, discount, shipping_address, payment_method, date_added, status, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerId,
                grossTotal,
                discount,
                shippingAddressByUser.get(order.userKey),
                order.paymentMethod,
                placedAt,
                order.status,
                plan.currency,
            ],
        );
        const orderId = asInsertId(result[0]);
        orderIds.set(order.key, orderId);

        for (const item of orderItems) {
            await connection.query(
                "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)",
                [orderId, item.productId, item.quantity, item.totalPrice],
            );
        }

        await connection.query(
            `INSERT INTO order_status_events
                (order_id, status, label, note, actor_id, created_at)
            VALUES (?, 0, 'Order placed', 'Digital-E demo seed order placed', ?, ?)`,
            [orderId, adminId, placedAt],
        );

        if (order.status === 1) {
            await connection.query(
                `INSERT INTO order_status_events
                    (order_id, status, label, note, actor_id, created_at)
                VALUES (?, 1, 'Order completed', 'Digital-E demo seed order completed', ?, ?)`,
                [orderId, adminId, dateDaysAgo(Math.max(0, placedDaysAgo - 1), 13 + (index % 4))],
            );

            for (const item of orderItems) {
                const stockBefore = stockByProductId.get(item.productId);
                const stockAfter = stockBefore - item.quantity;
                stockByProductId.set(item.productId, stockAfter);
                await connection.query(
                    `INSERT INTO inventory_movements
                        (product_id, order_id, movement_type, quantity_change, stock_before, stock_after, note, actor_id, created_at)
                    VALUES (?, ?, 'sale', ?, ?, ?, ?, ?, ?)`,
                    [
                        item.productId,
                        orderId,
                        -item.quantity,
                        stockBefore,
                        stockAfter,
                        `${DEMO_MOVEMENT_PREFIX} ${order.key}`,
                        adminId,
                        dateDaysAgo(Math.max(0, placedDaysAgo - 1), 13 + (index % 4)),
                    ],
                );
            }
        }

        if (order.status === 2) {
            await connection.query(
                `INSERT INTO order_status_events
                    (order_id, status, label, note, actor_id, created_at)
                VALUES (?, 2, 'Order canceled', 'Digital-E demo seed order canceled', ?, ?)`,
                [orderId, adminId, dateDaysAgo(Math.max(0, placedDaysAgo - 1), 14 + (index % 4))],
            );
        }
    }

    for (const [productId, finalStock] of stockByProductId.entries()) {
        await connection.query(
            `UPDATE products
             SET stock_revision = stock_revision + IF(stock <> ?, 1, 0), stock = ?, updated_at = UTC_TIMESTAMP()
             WHERE id = ?
               AND NOT EXISTS (SELECT 1 FROM purchase_order_items WHERE product_id = products.id)
               AND NOT EXISTS (SELECT 1 FROM stock_count_items WHERE product_id = products.id)`,
            [finalStock, finalStock, productId],
        );
    }

    return orderIds;
};

const seedReviews = async (connection, plan, userIds, productIds) => {
    for (const [index, review] of plan.reviews.entries()) {
        await connection.query(
            `INSERT INTO reviews (user_id, product_id, rating, review_text, created_at)
            VALUES (?, ?, ?, ?, ?)`,
            [
                userIds.get(review.userKey),
                productIds.get(review.productName),
                review.rating,
                `Digital-E demo review: ${review.text}`,
                dateDaysAgo(14 - (index % 10), 11 + (index % 7)),
            ],
        );
    }
};

const seedWishlists = async (connection, plan, userIds, productIds) => {
    for (const wishlist of plan.wishlists) {
        await connection.query(
            "INSERT INTO wishlist (user_id, product_id) VALUES (?, ?)",
            [userIds.get(wishlist.userKey), productIds.get(wishlist.productName)],
        );
    }
};

const seedNotifications = async (connection, plan, userIds, orderIds) => {
    for (const [index, notification] of plan.notifications.entries()) {
        await connection.query(
            `INSERT INTO customer_notifications
                (user_id, type, title, message, link, read_at, created_at)
            VALUES (?, 'order', ?, ?, ?, ?, ?)`,
            [
                userIds.get(notification.userKey),
                notification.title,
                notification.message,
                `/orders?order=${orderIds.get(notification.orderKey)}`,
                index % 3 === 0 ? dateDaysAgo(1) : null,
                dateDaysAgo(10 - (index % 6), 12 + (index % 5)),
            ],
        );
    }
};

const seedSessions = async (connection, plan, userIds) => {
    for (const [index, session] of plan.sessions.entries()) {
        const start = dateDaysAgo(session.daysAgo, 8 + (index % 8));
        const end = new Date(`${start.replace(" ", "T")}Z`);
        end.setUTCMinutes(end.getUTCMinutes() + session.durationMinutes);
        await connection.query(
            "INSERT INTO customer_sessions (user_id, session_start, session_end) VALUES (?, ?, ?)",
            [userIds.get(session.userKey), start, end.toISOString().slice(0, 19).replace("T", " ")],
        );
    }
};

const seedDiscounts = async (connection, plan) => {
    for (const discount of plan.discounts) {
        await connection.query(
            `INSERT INTO discounts
                (discount_code, description, discount_percent, active, min_order_value, starts_at, expires_at, usage_limit)
            VALUES (?, ?, ?, 1, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                description = VALUES(description),
                discount_percent = VALUES(discount_percent),
                active = 1,
                min_order_value = VALUES(min_order_value),
                starts_at = VALUES(starts_at),
                expires_at = VALUES(expires_at),
                usage_limit = VALUES(usage_limit)`,
            [
                discount.code,
                discount.description,
                discount.percent,
                discount.minOrderValue,
                dateDaysAgo(1),
                dateDaysAgo(-30),
                discount.usageLimit,
            ],
        );
    }
};

const main = async () => {
    assertDemoSeedTarget();
    const plan = await resolveDemoSeedPlan(DEMO_SEED_PLAN);
    const summary = validateDemoSeedPlan(plan);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        waitForConnections: true,
        connectionLimit: 5,
        queueLimit: 0,
        ssl: resolveDemoDatabaseSsl(),
    });
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const userIds = await upsertDemoUsers(connection, plan, passwordHash);
        const { productIds } = await upsertDemoProducts(connection, plan);
        const removedCatalogData = await clearLegacyCatalogProducts(connection, Array.from(productIds.values()));
        await clearDemoRows(connection, plan, userIds, productIds);
        await seedAddresses(connection, plan, userIds);
        await seedCarts(connection, plan, userIds, productIds);
        const orderIds = await seedOrders(connection, plan, userIds, productIds, plan.products);
        await seedReviews(connection, plan, userIds, productIds);
        await seedWishlists(connection, plan, userIds, productIds);
        await seedNotifications(connection, plan, userIds, orderIds);
        await seedSessions(connection, plan, userIds);
        await seedDiscounts(connection, plan);
        await connection.commit();

        process.stdout.write(`Digital-E demo seed complete: ${JSON.stringify(summary)}\n`);
        process.stdout.write(
            `Removed ${removedCatalogData.products} legacy or low-price catalog products, ${removedCatalogData.orders} linked test orders, and ${removedCatalogData.checkouts} related pending checkouts.\n`,
        );
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(
            `Digital-E demo seed failed: ${error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error)}\n`,
        );
        process.exitCode = 1;
    });
}

module.exports = { main };
