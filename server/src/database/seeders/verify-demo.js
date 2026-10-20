const path = require("path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const mysql = require("mysql2/promise");
const { ORDER_STATUS, USER_ROLE } = require("./constants.js");
const {
    assertExplicitDemoSeedTarget,
    assertLocalDatabaseTarget,
    DESTRUCTIVE_DEMO_SEED_MODE,
} = require("../../config/database-target");
const { resolveDemoDatabaseSsl } = require("./database-ssl.js");
const { DEMO_SEED_PLAN, DEMO_SEED_MIN_PRICE_VND, validateDemoSeedPlan } = require("./demo-seed-data");
const { resolveDemoSeedPlan } = require("./demo-firebase-identities");

const DEMO_ORDER_EVENT_NOTE_PREFIX = "Digital-E demo seed order%";
const DEMO_NOTIFICATION_PREFIX = "Demo";
const DEMO_MOVEMENT_PREFIX = "Digital-E demo seed";
const MIN_ACCOUNT_ORDER_COUNT = 25;

const isDemoVerificationMatch = (actual, expected) => Object.entries(expected).every(([key, expectedValue]) => {
    const actualValue = actual[key];

    // Customer sessions are operational telemetry, so logins after seeding may
    // add rows without changing the seeded demo baseline.
    if (key === "sessions") return Number(actualValue) >= Number(expectedValue);
    return actualValue === expectedValue;
});

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

const query = (connection, sql, params = []) => connection.query(sql, params).then(([rows]) => rows);
const firstCount = (rows) => Number(rows[0]?.count || 0);

const verify = async (connection, plan) => {
    validateDemoSeedPlan(plan);

    const userIds = plan.users.map((user) => user.id);
    const customerIds = plan.users.filter((user) => user.role === USER_ROLE.CUSTOMER).map((user) => user.id);
    const productNames = plan.products.map((product) => product.name);
    const productIds = (await query(connection, "SELECT id FROM products WHERE name IN (?)", [productNames])).map((row) => Number(row.id));
    const [users, firebaseLinkedUsers, verifiedUsers, categories, brands, products, productImages, invalidCatalogProducts, carts, cartItems, orders, orderItems, reviews, wishlists, addresses, notifications, sessions, discounts, inventoryMovements, statusEvents, customerOrderCounts] = await Promise.all([
        query(connection, "SELECT COUNT(*) AS count FROM users WHERE id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM users WHERE id IN (?) AND auth_provider = 'firebase' AND provider_user_id = id", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM users WHERE id IN (?) AND email_verified_at IS NOT NULL", [userIds]),
        query(connection, "SELECT COUNT(DISTINCT c.name) AS count FROM categories c WHERE c.name IN (?)", [plan.categories]),
        query(connection, "SELECT COUNT(DISTINCT b.name) AS count FROM brands b WHERE b.name IN (?)", [plan.brands]),
        query(connection, "SELECT COUNT(*) AS count FROM products WHERE name IN (?)", [productNames]),
        query(connection, "SELECT COUNT(*) AS count FROM products WHERE name IN (?) AND main_image IS NOT NULL AND main_image <> ''", [productNames]),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM products WHERE LOWER(name) LIKE ? OR LOWER(name) LIKE ? OR price < ? OR (sale_price IS NOT NULL AND sale_price < ?)",
            ["%e2e%", "%demo%", DEMO_SEED_MIN_PRICE_VND, DEMO_SEED_MIN_PRICE_VND],
        ),
        query(connection, "SELECT COUNT(*) AS count FROM carts WHERE user_id IN (?)", [userIds]),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id IN (?) AND ci.product_id IN (?)",
            [userIds, productIds],
        ),
        query(
            connection,
            "SELECT COUNT(DISTINCT o.id) AS count FROM orders o JOIN order_status_events ose ON ose.order_id = o.id WHERE o.user_id IN (?) AND ose.note LIKE ?",
            [userIds, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            "SELECT COUNT(DISTINCT oi.id) AS count FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN order_status_events ose ON ose.order_id = o.id WHERE o.user_id IN (?) AND ose.note LIKE ? AND oi.product_id IN (?)",
            [userIds, DEMO_ORDER_EVENT_NOTE_PREFIX, productIds],
        ),
        query(connection, "SELECT COUNT(*) AS count FROM reviews WHERE user_id IN (?) AND product_id IN (?) AND review_text LIKE ?", [userIds, productIds, "Digital-E demo review:%"]),
        query(connection, "SELECT COUNT(*) AS count FROM wishlist WHERE user_id IN (?) AND product_id IN (?)", [userIds, productIds]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_addresses WHERE user_id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_notifications WHERE user_id IN (?) AND title LIKE ?", [userIds, `${DEMO_NOTIFICATION_PREFIX}%`]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_sessions WHERE user_id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM discounts WHERE discount_code IN (?)", [plan.discounts.map((discount) => discount.code)]),
        query(connection, "SELECT COUNT(*) AS count FROM inventory_movements WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX}%`]),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM order_status_events ose JOIN orders o ON o.id = ose.order_id WHERE o.user_id IN (?) AND ose.note LIKE ?",
            [userIds, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT o.user_id,
                    COUNT(DISTINCT o.id) AS order_count,
                    COUNT(DISTINCT CASE WHEN o.status = ? THEN o.id END) AS completed_count,
                    COUNT(DISTINCT CASE WHEN o.status = ? THEN o.id END) AS canceled_count
             FROM orders o
             JOIN order_status_events ose ON ose.order_id = o.id
             WHERE o.user_id IN (?) AND ose.note LIKE ?
             GROUP BY o.user_id`,
            [ORDER_STATUS.DONE, ORDER_STATUS.CANCELED, userIds, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
    ]);

    const [productOrphans, cartOrphans, orderOrphans, reviewOrphans, wishlistOrphans, orderTotalMismatches, movementOrphans, statusEventOrphans, productOrderGaps, productReviewGaps, productWishlistGaps] = await Promise.all([
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            LEFT JOIN brands b ON b.id = p.brand_id
            WHERE p.name IN (?) AND (c.id IS NULL OR b.id IS NULL)`,
            [productNames],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM cart_items ci
            LEFT JOIN carts c ON c.id = ci.cart_id
            LEFT JOIN users u ON u.id = c.user_id
            LEFT JOIN products p ON p.id = ci.product_id
            WHERE (c.user_id IN (?) OR ci.product_id IN (?))
              AND (c.id IS NULL OR u.id IS NULL OR p.id IS NULL)`,
            [userIds, productIds],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM orders o
            LEFT JOIN users u ON u.id = o.user_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN products p ON p.id = oi.product_id
            WHERE o.user_id IN (?) AND EXISTS (
                SELECT 1 FROM order_status_events ose
                WHERE ose.order_id = o.id AND ose.note LIKE ?
            )
              AND (u.id IS NULL OR oi.id IS NULL OR p.id IS NULL)`,
            [userIds, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM reviews r
            LEFT JOIN users u ON u.id = r.user_id
            LEFT JOIN products p ON p.id = r.product_id
            WHERE r.user_id IN (?) AND r.product_id IN (?) AND r.review_text LIKE ?
              AND (u.id IS NULL OR p.id IS NULL)`,
            [userIds, productIds, "Digital-E demo review:%"],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM wishlist w
            LEFT JOIN users u ON u.id = w.user_id
            LEFT JOIN products p ON p.id = w.product_id
            WHERE w.user_id IN (?) AND w.product_id IN (?)
              AND (u.id IS NULL OR p.id IS NULL)`,
            [userIds, productIds],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM (
                SELECT o.id
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id = o.id
                WHERE o.user_id IN (?) AND EXISTS (
                    SELECT 1 FROM order_status_events ose
                    WHERE ose.order_id = o.id AND ose.note LIKE ?
                )
                GROUP BY o.id, o.total_price
                HAVING COUNT(oi.id) = 0
                    OR ROUND(o.total_price, 2) <> ROUND(COALESCE(SUM(oi.total_price), 0), 2)
            ) mismatches`,
            [userIds, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM inventory_movements im
            LEFT JOIN products p ON p.id = im.product_id
            LEFT JOIN orders o ON o.id = im.order_id
            WHERE im.note LIKE ? AND (p.id IS NULL OR o.id IS NULL)`,
            [`${DEMO_MOVEMENT_PREFIX}%`],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM order_status_events ose
            LEFT JOIN orders o ON o.id = ose.order_id
            LEFT JOIN users u ON u.id = ose.actor_id
            WHERE ose.note LIKE ? AND (o.id IS NULL OR u.id IS NULL)`,
            [DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM products p
            WHERE p.name IN (?)
              AND NOT EXISTS (
                  SELECT 1
                  FROM order_items oi
                  JOIN orders o ON o.id = oi.order_id
                  WHERE oi.product_id = p.id
                    AND o.user_id IN (?)
                    AND o.status = ?
                    AND EXISTS (
                        SELECT 1 FROM order_status_events ose
                        WHERE ose.order_id = o.id AND ose.note LIKE ?
                    )
              )`,
            [productNames, customerIds, ORDER_STATUS.DONE, DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM products p
            WHERE p.name IN (?)
              AND NOT EXISTS (
                  SELECT 1
                  FROM reviews r
                  JOIN users u ON u.id = r.user_id
                  JOIN order_items oi ON oi.product_id = r.product_id
                  JOIN orders o ON o.id = oi.order_id AND o.user_id = r.user_id
                  WHERE r.product_id = p.id
                    AND u.role = ?
                    AND o.status = ?
                    AND r.review_text LIKE ?
                    AND EXISTS (
                        SELECT 1 FROM order_status_events ose
                        WHERE ose.order_id = o.id AND ose.note LIKE ?
                    )
              )`,
            [productNames, USER_ROLE.CUSTOMER, ORDER_STATUS.DONE, "Digital-E demo review:%", DEMO_ORDER_EVENT_NOTE_PREFIX],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM products p
            WHERE p.name IN (?)
              AND NOT EXISTS (
                  SELECT 1
                  FROM wishlist w
                  WHERE w.product_id = p.id
                    AND w.user_id IN (?)
              )`,
            [productNames, userIds],
        ),
    ]);

    const actual = {
        users: firstCount(users),
        firebaseLinkedUsers: firstCount(firebaseLinkedUsers),
        verifiedUsers: firstCount(verifiedUsers),
        categories: firstCount(categories),
        brands: firstCount(brands),
        products: firstCount(products),
        productImages: firstCount(productImages),
        invalidCatalogProducts: firstCount(invalidCatalogProducts),
        carts: firstCount(carts),
        cartItems: firstCount(cartItems),
        orders: firstCount(orders),
        orderItems: firstCount(orderItems),
        reviews: firstCount(reviews),
        wishlists: firstCount(wishlists),
        addresses: firstCount(addresses),
        notifications: firstCount(notifications),
        sessions: firstCount(sessions),
        discounts: firstCount(discounts),
        inventoryMovements: firstCount(inventoryMovements),
        statusEvents: firstCount(statusEvents),
        productOrphans: firstCount(productOrphans),
        cartOrphans: firstCount(cartOrphans),
        orderOrphans: firstCount(orderOrphans),
        reviewOrphans: firstCount(reviewOrphans),
        wishlistOrphans: firstCount(wishlistOrphans),
        orderTotalMismatches: firstCount(orderTotalMismatches),
        movementOrphans: firstCount(movementOrphans),
        statusEventOrphans: firstCount(statusEventOrphans),
        productOrderGaps: firstCount(productOrderGaps),
        productReviewGaps: firstCount(productReviewGaps),
        productWishlistGaps: firstCount(productWishlistGaps),
        accountsMeetingOrderMinimum: customerOrderCounts.filter((row) => Number(row.order_count) >= MIN_ACCOUNT_ORDER_COUNT).length,
        accountsWithCompletedAndCanceledOrders: customerOrderCounts.filter(
            (row) => Number(row.completed_count) > 0 && Number(row.canceled_count) > 0,
        ).length,
    };

    const summary = validateDemoSeedPlan(plan);
    const accountCount = plan.users.length;
    const itemCount = (ordersToCount) => ordersToCount.reduce((total, order) => total + order.items.length, 0);
    const expected = {
        users: summary.users,
        firebaseLinkedUsers: summary.users,
        verifiedUsers: plan.users.filter((user) => user.emailVerified).length,
        categories: summary.categories,
        brands: summary.brands,
        products: summary.products,
        productImages: summary.products,
        invalidCatalogProducts: 0,
        carts: summary.carts,
        cartItems: plan.carts.reduce((total, cart) => total + cart.items.length, 0),
        orders: summary.orders,
        orderItems: itemCount(plan.orders),
        reviews: summary.reviews,
        wishlists: summary.wishlists,
        addresses: summary.addresses,
        notifications: summary.notifications,
        sessions: summary.sessions,
        discounts: summary.discounts,
        inventoryMovements: plan.orders
            .filter((order) => order.status === ORDER_STATUS.DONE)
            .reduce((total, order) => total + order.items.length, 0),
        statusEvents: plan.orders.reduce((total, order) => total + (order.status === ORDER_STATUS.PENDING ? 1 : 2), 0),
        accountsMeetingOrderMinimum: accountCount,
        accountsWithCompletedAndCanceledOrders: accountCount,
        productOrphans: 0,
        cartOrphans: 0,
        orderOrphans: 0,
        reviewOrphans: 0,
        wishlistOrphans: 0,
        orderTotalMismatches: 0,
        movementOrphans: 0,
        statusEventOrphans: 0,
        productOrderGaps: 0,
        productReviewGaps: 0,
        productWishlistGaps: 0,
    };

    if (!isDemoVerificationMatch(actual, expected)) {
        throw new Error(`Digital-E demo verification failed: ${JSON.stringify(actual)}`);
    }

    process.stdout.write(`Digital-E demo verified: ${JSON.stringify(actual)}\n`);
};

const main = async () => {
    assertDemoSeedTarget();
    const plan = await resolveDemoSeedPlan(DEMO_SEED_PLAN);

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
        await verify(connection, plan);
    } finally {
        connection.release();
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(
            `Digital-E demo verification failed: ${error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error)}\n`,
        );
        process.exitCode = 1;
    });
}

module.exports = { isDemoVerificationMatch, main };
