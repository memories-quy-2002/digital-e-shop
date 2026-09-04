const path = require("path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const { assertLocalDatabaseTarget } = require("../../config/database-target");
const { DEMO_PASSWORD, DEMO_SEED_PLAN, validateDemoSeedPlan } = require("./demoSeedData");

const LOOKUP_TABLES = new Set(["categories", "brands"]);
const DEMO_ORDER_ADDRESS_PREFIX = "Digital-E Demo Order ";
const DEMO_ORDER_SESSION_PREFIX = "digital-e-demo-order-";
const DEMO_NOTIFICATION_PREFIX = "Demo";
const DEMO_MOVEMENT_PREFIX = "Digital-E demo seed";

const roundMoney = (value) => Number(Number(value).toFixed(2));

const dateDaysAgo = (daysAgo, hour = 10) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(hour, (daysAgo * 7) % 60, 0, 0);
    return date.toISOString().slice(0, 19).replace("T", " ");
};

const query = (connection, sql, params = []) => connection.query(sql, params).then(([rows]) => rows);

const asInsertId = (result) => Number(result.insertId);

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
                (id, username, email, password, role, token, first_name, last_name, status, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, '', ?, ?, 'Active', ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                email = VALUES(email),
                password = VALUES(password),
                role = VALUES(role),
                token = '',
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                status = 'Active'`,
            [
                user.id,
                user.username,
                user.email,
                passwordHash,
                user.role,
                user.firstName,
                user.lastName,
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

    for (const product of plan.products) {
        const categoryId = categoryIds.get(product.categoryName);
        const brandId = brandIds.get(product.brandName);
        const existing = await query(connection, "SELECT id FROM products WHERE name = ? ORDER BY id LIMIT 1", [product.name]);

        if (existing[0]) {
            const productId = Number(existing[0].id);
            await connection.query(
                `UPDATE products
                SET description = ?, category_id = ?, brand_id = ?, price = ?, sale_price = ?, stock = ?, main_image = ?, specifications = ?, updated_at = UTC_TIMESTAMP()
                WHERE id = ?`,
                [
                    product.description,
                    categoryId,
                    brandId,
                    product.price,
                    product.salePrice,
                    product.stock,
                    product.mainImage,
                    product.specifications,
                    productId,
                ],
            );
            productIds.set(product.name, productId);
            continue;
        }

        const result = await connection.query(
            `INSERT INTO products
                (name, description, category_id, brand_id, price, sale_price, stock, main_image, specifications, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
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
            ],
        );
        productIds.set(product.name, asInsertId(result[0]));
    }

    return { categoryIds, brandIds, productIds };
};

const findDemoOrderIds = async (connection, userIds) => {
    const rows = await query(
        connection,
        "SELECT id FROM orders WHERE user_id IN (?) AND (shipping_address LIKE ? OR stripe_checkout_session_id LIKE ?)",
        [Array.from(userIds.values()), `${DEMO_ORDER_ADDRESS_PREFIX}%`, `${DEMO_ORDER_SESSION_PREFIX}%`],
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
    await deleteByIds(connection, "order_items", "order_id", orderIds);
    await deleteByIds(connection, "cart_items", "cart_id", cartIds);
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
    await connection.query("DELETE FROM discounts WHERE discount_code IN (?)", [plan.discounts.map((discount) => discount.code)]);
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
                (user_id, total_price, discount, shipping_address, payment_method, stripe_checkout_session_id, date_added, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerId,
                grossTotal,
                discount,
                shippingAddressByUser.get(order.userKey),
                order.paymentMethod,
                `${DEMO_ORDER_SESSION_PREFIX}${order.key}`,
                dateDaysAgo(18 - index, 9 + (index % 6)),
                order.status,
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
            [orderId, adminId, dateDaysAgo(18 - index, 9 + (index % 6))],
        );

        if (order.status === 1) {
            await connection.query(
                `INSERT INTO order_status_events
                    (order_id, status, label, note, actor_id, created_at)
                VALUES (?, 1, 'Order completed', 'Digital-E demo seed order completed', ?, ?)`,
                [orderId, adminId, dateDaysAgo(16 - index, 13 + (index % 4))],
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
                        dateDaysAgo(16 - index, 13 + (index % 4)),
                    ],
                );
            }
        }

        if (order.status === 2) {
            await connection.query(
                `INSERT INTO order_status_events
                    (order_id, status, label, note, actor_id, created_at)
                VALUES (?, 2, 'Order canceled', 'Digital-E demo seed order canceled', ?, ?)`,
                [orderId, adminId, dateDaysAgo(15 - index, 14 + (index % 4))],
            );
        }
    }

    for (const [productId, finalStock] of stockByProductId.entries()) {
        await connection.query("UPDATE products SET stock = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?", [finalStock, productId]);
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
    const summary = validateDemoSeedPlan(DEMO_SEED_PLAN);
    assertLocalDatabaseTarget({
        dbHost: process.env.DB_HOST,
        databaseUrl: process.env.DATABASE_URL,
    });

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
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const userIds = await upsertDemoUsers(connection, DEMO_SEED_PLAN, passwordHash);
        const { productIds } = await upsertDemoProducts(connection, DEMO_SEED_PLAN);
        await clearDemoRows(connection, DEMO_SEED_PLAN, userIds, productIds);
        await seedAddresses(connection, DEMO_SEED_PLAN, userIds);
        await seedCarts(connection, DEMO_SEED_PLAN, userIds, productIds);
        const orderIds = await seedOrders(connection, DEMO_SEED_PLAN, userIds, productIds, DEMO_SEED_PLAN.products);
        await seedReviews(connection, DEMO_SEED_PLAN, userIds, productIds);
        await seedWishlists(connection, DEMO_SEED_PLAN, userIds, productIds);
        await seedNotifications(connection, DEMO_SEED_PLAN, userIds, orderIds);
        await seedSessions(connection, DEMO_SEED_PLAN, userIds);
        await seedDiscounts(connection, DEMO_SEED_PLAN);
        await connection.commit();

        console.log(`Digital-E demo seed complete: ${JSON.stringify(summary)}`);
        console.log("Demo login password for all four accounts: DemoPass123!");
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
        console.error("Digital-E demo seed failed:", error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error));
        process.exitCode = 1;
    });
}

module.exports = { main };
