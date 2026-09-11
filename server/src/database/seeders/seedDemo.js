const path = require("path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const mysql = require("mysql2/promise");
const {
    assertExplicitDemoSeedTarget,
    assertLocalDatabaseTarget,
    DESTRUCTIVE_DEMO_SEED_MODE,
} = require("../../config/database-target");
const { resolveDemoDatabaseSsl } = require("./databaseSsl.js");
const {
    DEMO_PASSWORD,
    DEMO_SEED_PLAN,
    shouldSeedFirebaseUsersUnverified,
    validateDemoSeedPlan,
} = require("./demoSeedData");

const LOOKUP_TABLES = new Set(["categories", "brands"]);
const DEMO_ORDER_ADDRESS_PREFIX = "Digital-E Demo Order ";
const DEMO_ORDER_SESSION_PREFIX = "digital-e-demo-order-";
const DEMO_NOTIFICATION_PREFIX = "Demo";
const DEMO_MOVEMENT_PREFIX = "Digital-E demo seed";
const LEGACY_PRODUCT_NAME_PATTERNS = ["%e2e%", "%demo%"];
const DEMO_CATEGORY_METADATA = {
    Laptop: { slug: "laptops", catalogGroup: "Computers", sortOrder: 10 },
    Smartphone: { slug: "smartphones", catalogGroup: "Mobile", sortOrder: 10 },
    PC: { slug: "pc-and-peripherals", catalogGroup: "Computers", sortOrder: 30 },
    Monitor: { slug: "monitors", catalogGroup: "Displays", sortOrder: 10 },
    Headphone: { slug: "headphones", catalogGroup: "Audio", sortOrder: 10 },
    "Graphics Card": { slug: "graphics-cards", catalogGroup: "Computers", sortOrder: 40 },
    Console: { slug: "consoles", catalogGroup: "Gaming", sortOrder: 10 },
    Camera: { slug: "cameras", catalogGroup: "Cameras", sortOrder: 10 },
};

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

    if (tableName === "categories") {
        const metadata = DEMO_CATEGORY_METADATA[name] || {
            slug: "legacy-" + Date.now() + "-" + Math.floor(Math.random() * 100000),
            catalogGroup: null,
            sortOrder: 1000,
        };
        const result = await connection.query(
            "INSERT INTO categories (name, slug, catalog_group, is_active, sort_order) VALUES (?, ?, ?, ?, ?)",
            [name, metadata.slug, metadata.catalogGroup, metadata.catalogGroup ? 1 : 0, metadata.sortOrder],
        );
        return asInsertId(result[0]);
    }

    const result = await connection.query("INSERT INTO brands (name) VALUES (?)", [name]);
    return asInsertId(result[0]);
};

const upsertDemoTaxonomy = async (connection, plan, categoryIds) => {
    for (const categoryName of plan.categories) {
        const categoryId = categoryIds.get(categoryName);
        const metadata = DEMO_CATEGORY_METADATA[categoryName];
        if (!categoryId || !metadata) {
            throw new Error("Missing demo taxonomy metadata for category: " + categoryName);
        }
        await connection.query(
            "UPDATE categories SET slug = ?, catalog_group = ?, is_active = 1, sort_order = ? WHERE id = ?",
            [metadata.slug, metadata.catalogGroup, metadata.sortOrder, categoryId],
        );
    }

    for (const alias of plan.categoryAliases || []) {
        const categoryId = categoryIds.get(alias.categoryName);
        await connection.query(
            "INSERT INTO category_aliases (alias_slug, alias_name, category_id) VALUES (?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE alias_name = VALUES(alias_name), category_id = VALUES(category_id)",
            [alias.aliasSlug, alias.aliasName, categoryId],
        );
    }

    for (const definition of plan.categoryAttributeDefinitions || []) {
        const categoryId = categoryIds.get(definition.categoryName);
        await connection.query(
            "INSERT INTO category_attribute_definitions " +
            "(category_id, attribute_key, label, value_type, unit, filterable, comparable, facet_order, comparison_order) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) " +
            "ON DUPLICATE KEY UPDATE label = VALUES(label), value_type = VALUES(value_type), unit = VALUES(unit), " +
            "filterable = VALUES(filterable), comparable = VALUES(comparable), facet_order = VALUES(facet_order), " +
            "comparison_order = VALUES(comparison_order)",
            [
                categoryId,
                definition.attributeKey,
                definition.label,
                definition.valueType,
                definition.unit || null,
                definition.filterable === false ? 0 : 1,
                definition.comparable === false ? 0 : 1,
                definition.facetOrder || 100,
                definition.comparisonOrder || 100,
            ],
        );
    }
};

const upsertDemoUsers = async (connection, plan, passwordPlaceholder) => {
    const userIds = new Map();
    const emailVerifiedAtExpression = shouldSeedFirebaseUsersUnverified() ? "NULL" : "UTC_TIMESTAMP()";

    for (const [index, user] of plan.users.entries()) {
        await connection.query(
            `INSERT INTO users
                (id, username, email, password, role, token, auth_provider, provider_user_id, first_name, last_name, status, email_verified_at, created_at, last_login)
            VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'Active', ${emailVerifiedAtExpression}, ?, ?)
            ON DUPLICATE KEY UPDATE
                username = VALUES(username),
                email = VALUES(email),
                password = VALUES(password),
                role = VALUES(role),
                token = '',
                auth_provider = VALUES(auth_provider),
                provider_user_id = VALUES(provider_user_id),
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                status = 'Active',
                email_verified_at = ${emailVerifiedAtExpression}`,
            [
                user.id,
                user.username,
                user.email,
                passwordPlaceholder,
                user.role,
                user.authProvider,
                user.id,
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
    await upsertDemoTaxonomy(connection, plan, categoryIds);

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
            await connection.query(
                `UPDATE products
                SET description = ?, category_id = ?, brand_id = ?, price = ?, sale_price = ?, stock = ?, main_image = ?, specifications = ?, sku = ?, manufacturer_part_number = ?, updated_at = UTC_TIMESTAMP()
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
                    sku,
                    product.manufacturerPartNumber,
                    productId,
                ],
            );
            productIds.set(product.name, productId);
            continue;
        }

        const result = await connection.query(
            `INSERT INTO products
                (name, description, category_id, brand_id, price, sale_price, stock, main_image, specifications, sku, manufacturer_part_number, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
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
                product.manufacturerPartNumber,
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

const findAllUserOrderIds = async (connection, userIds) => {
    const values = Array.from(userIds.values());
    if (values.length === 0) return [];
    const rows = await query(connection, "SELECT id FROM orders WHERE user_id IN (?)", [values]);
    return rows.map((row) => Number(row.id));
};

const findPendingCheckoutIds = async (connection, userIds) => {
    const values = Array.from(userIds.values());
    if (values.length === 0) return [];
    const rows = await query(connection, "SELECT id FROM pending_checkouts WHERE user_id IN (?)", [values]);
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

const clearDemoRows = async (connection, plan, userIds, productIds, options = {}) => {
    const userIdValues = Array.from(userIds.values());
    const productIdValues = Array.from(productIds.values());
    const orderIds = options.allUserRows
        ? await findAllUserOrderIds(connection, userIds)
        : await findDemoOrderIds(connection, userIds);
    const cartIds = await findDemoCartIds(connection, userIds);
    const pendingCheckoutIds = options.allUserRows
        ? await findPendingCheckoutIds(connection, userIds)
        : [];

    await deleteByIds(connection, "product_attributes", "product_id", productIdValues);
    await deleteByIds(connection, "inventory_movements", "order_id", orderIds);
    await connection.query("DELETE FROM inventory_movements WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX}%`]);
    await deleteByIds(connection, "order_status_events", "order_id", orderIds);
    await connection.query("DELETE FROM order_status_events WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX} order%`]);
    await deleteByIds(connection, "order_payments", "order_id", orderIds);
    await deleteByIds(connection, "discount_redemptions", "order_id", orderIds);
    await deleteByIds(connection, "support_tickets", "order_id", orderIds);
    if (options.allUserRows) {
        await deleteByIds(connection, "support_tickets", "user_id", userIdValues);
        await deleteByIds(connection, "inventory_reservations", "pending_checkout_id", pendingCheckoutIds);
        await deleteByIds(connection, "discount_redemptions", "pending_checkout_id", pendingCheckoutIds);
        await deleteByIds(connection, "pending_checkouts", "id", pendingCheckoutIds);
    }
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
    if (options.allUserRows) {
        await connection.query("DELETE FROM reviews WHERE user_id IN (?)", [userIdValues]);
        await connection.query("DELETE FROM wishlist WHERE user_id IN (?)", [userIdValues]);
        await connection.query("DELETE FROM customer_notifications WHERE user_id IN (?)", [userIdValues]);
        await connection.query("DELETE FROM marketing_subscriptions WHERE user_id IN (?)", [userIdValues]);
    } else {
        await connection.query("DELETE FROM reviews WHERE user_id IN (?) AND product_id IN (?)", [userIdValues, productIdValues]);
        await connection.query("DELETE FROM wishlist WHERE user_id IN (?) AND product_id IN (?)", [userIdValues, productIdValues]);
        await connection.query(
            "DELETE FROM customer_notifications WHERE user_id IN (?) AND title LIKE ?",
            [userIdValues, `${DEMO_NOTIFICATION_PREFIX}%`],
        );
    }
    await connection.query("DELETE FROM customer_sessions WHERE user_id IN (?)", [userIdValues]);
    await connection.query("DELETE FROM customer_addresses WHERE user_id IN (?)", [userIdValues]);
    await deleteByIds(connection, "orders", "id", orderIds);
    await deleteByIds(connection, "carts", "id", cartIds);
    await connection.query("DELETE FROM discounts WHERE discount_code IN (?)", [demoDiscountCodes]);
};

const findExistingDemoUserIds = async (connection, plan) => {
    const rows = await query(
        connection,
        "SELECT id, email FROM users WHERE email IN (?)",
        [plan.users.map((user) => user.email)],
    );
    const userIds = new Map();
    for (const user of plan.users) {
        const existing = rows.find((row) => row.email === user.email);
        if (existing) {
            userIds.set(user.key, existing.id);
        }
    }
    return userIds;
};

const deleteDemoUsers = async (connection, userIds) => {
    await deleteByIds(connection, "users", "id", Array.from(userIds.values()));
};

const clearLegacyCatalogProducts = async (connection) => {
    const rows = await query(
        connection,
        "SELECT id FROM products WHERE LOWER(name) LIKE ? OR LOWER(name) LIKE ?",
        LEGACY_PRODUCT_NAME_PATTERNS,
    );
    const productIds = rows.map((row) => Number(row.id));

    if (productIds.length === 0) {
        return 0;
    }

    await deleteByIds(connection, "product_attributes", "product_id", productIds);
    await deleteByIds(connection, "inventory_reservations", "product_id", productIds);
    await deleteByIds(connection, "cart_items", "product_id", productIds);
    await deleteByIds(connection, "order_items", "product_id", productIds);
    await deleteByIds(connection, "reviews", "product_id", productIds);
    await deleteByIds(connection, "wishlist", "product_id", productIds);
    await deleteByIds(connection, "inventory_movements", "product_id", productIds);
    await deleteByIds(connection, "products", "id", productIds);

    return productIds.length;
};

const seedProductAttributes = async (connection, plan, productIds) => {
    for (const product of plan.products) {
        const productId = productIds.get(product.name);
        for (const attribute of product.attributes || []) {
            await connection.query(
                "INSERT INTO product_attributes " +
                "(product_id, attribute_key, label, value_type, text_value, number_value, unit, filterable) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    productId,
                    attribute.key,
                    attribute.label,
                    attribute.type,
                    attribute.type === "text" ? attribute.textValue : null,
                    attribute.type === "number" ? attribute.numberValue : null,
                    attribute.unit || null,
                    attribute.filterable === false ? 0 : 1,
                ],
            );
        }
    }
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
                (user_id, total_price, discount, shipping_address, payment_method, stripe_checkout_session_id, date_added, status, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                customerId,
                grossTotal,
                discount,
                shippingAddressByUser.get(order.userKey),
                order.paymentMethod,
                `${DEMO_ORDER_SESSION_PREFIX}${order.key}`,
                dateDaysAgo(18 - index, 9 + (index % 6)),
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
    assertDemoSeedTarget();

    const passwordPlaceholder = "firebase-managed";
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
    let seedStep = "begin transaction";

    try {
        await connection.beginTransaction();
        seedStep = "upsert demo categories, brands, and products";
        const { productIds } = await upsertDemoProducts(connection, DEMO_SEED_PLAN);
        seedStep = "remove legacy catalog products";
        const legacyProductCount = await clearLegacyCatalogProducts(connection);
        const existingDemoUserIds = await findExistingDemoUserIds(connection, DEMO_SEED_PLAN);
        seedStep = "clear demo-owned rows";
        await clearDemoRows(connection, DEMO_SEED_PLAN, existingDemoUserIds, productIds, { allUserRows: true });
        seedStep = "replace legacy demo user IDs";
        await deleteDemoUsers(connection, existingDemoUserIds);
        seedStep = "upsert demo users";
        const userIds = await upsertDemoUsers(connection, DEMO_SEED_PLAN, passwordPlaceholder);
        seedStep = "seed product attributes";
        await seedProductAttributes(connection, DEMO_SEED_PLAN, productIds);
        seedStep = "seed addresses";
        await seedAddresses(connection, DEMO_SEED_PLAN, userIds);
        seedStep = "seed carts";
        await seedCarts(connection, DEMO_SEED_PLAN, userIds, productIds);
        seedStep = "seed orders";
        const orderIds = await seedOrders(connection, DEMO_SEED_PLAN, userIds, productIds, DEMO_SEED_PLAN.products);
        seedStep = "seed reviews";
        await seedReviews(connection, DEMO_SEED_PLAN, userIds, productIds);
        seedStep = "seed wishlists";
        await seedWishlists(connection, DEMO_SEED_PLAN, userIds, productIds);
        seedStep = "seed notifications";
        await seedNotifications(connection, DEMO_SEED_PLAN, userIds, orderIds);
        seedStep = "seed sessions";
        await seedSessions(connection, DEMO_SEED_PLAN, userIds);
        seedStep = "seed discounts";
        await seedDiscounts(connection, DEMO_SEED_PLAN);
        seedStep = "commit transaction";
        await connection.commit();

        console.log(`Digital-E demo seed complete: ${JSON.stringify(summary)}`);
        console.log(`Removed ${legacyProductCount} legacy E2E/Demo catalog products.`);
        console.log("Demo Firebase credentials are configured for seeded accounts (password not logged).");
    } catch (error) {
        await connection.rollback();
        if (error && typeof error === "object") {
            error.seedStep = seedStep;
        }
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        const detail = error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error);
        console.error("Digital-E demo seed failed at " + (error?.seedStep || "unknown step") + ":", detail);
        process.exitCode = 1;
    });
}

module.exports = { main };
