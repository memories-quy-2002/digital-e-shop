const path = require("path");

require("dotenv").config({
    path: process.env.DIGITAL_E_SEED_ENV_FILE || path.join(__dirname, "..", "..", "..", ".env"),
});

const mysql = require("mysql2/promise");
const { assertLocalDatabaseTarget } = require("../../config/database-target");
const { DEMO_SEED_PLAN, validateDemoSeedPlan } = require("./demoSeedData");

const DEMO_ORDER_SESSION_PREFIX = "digital-e-demo-order-";
const DEMO_NOTIFICATION_PREFIX = "Demo";
const DEMO_MOVEMENT_PREFIX = "Digital-E demo seed";

const query = (connection, sql, params = []) => connection.query(sql, params).then(([rows]) => rows);
const firstCount = (rows) => Number(rows[0]?.count || 0);

const verify = async (connection) => {
    validateDemoSeedPlan(DEMO_SEED_PLAN);

    const userIds = DEMO_SEED_PLAN.users.map((user) => user.id);
    const productNames = DEMO_SEED_PLAN.products.map((product) => product.name);
    const productIds = (await query(connection, "SELECT id FROM products WHERE name IN (?)", [productNames])).map((row) => Number(row.id));
    const [users, categories, brands, products, productImages, carts, cartItems, orders, orderItems, reviews, wishlists, addresses, notifications, sessions, discounts, inventoryMovements, statusEvents] = await Promise.all([
        query(connection, "SELECT COUNT(*) AS count FROM users WHERE id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(DISTINCT c.name) AS count FROM categories c WHERE c.name IN (?)", [DEMO_SEED_PLAN.categories]),
        query(connection, "SELECT COUNT(DISTINCT b.name) AS count FROM brands b WHERE b.name IN (?)", [DEMO_SEED_PLAN.brands]),
        query(connection, "SELECT COUNT(*) AS count FROM products WHERE name IN (?)", [productNames]),
        query(connection, "SELECT COUNT(*) AS count FROM products WHERE name IN (?) AND main_image IS NOT NULL AND main_image <> ''", [productNames]),
        query(connection, "SELECT COUNT(*) AS count FROM carts WHERE user_id IN (?)", [userIds]),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM cart_items ci JOIN carts c ON c.id = ci.cart_id WHERE c.user_id IN (?) AND ci.product_id IN (?)",
            [userIds, productIds],
        ),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM orders WHERE user_id IN (?) AND stripe_checkout_session_id LIKE ?",
            [userIds, `${DEMO_ORDER_SESSION_PREFIX}%`],
        ),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.user_id IN (?) AND o.stripe_checkout_session_id LIKE ? AND oi.product_id IN (?)",
            [userIds, `${DEMO_ORDER_SESSION_PREFIX}%`, productIds],
        ),
        query(connection, "SELECT COUNT(*) AS count FROM reviews WHERE user_id IN (?) AND product_id IN (?) AND review_text LIKE ?", [userIds, productIds, "Digital-E demo review:%"]),
        query(connection, "SELECT COUNT(*) AS count FROM wishlist WHERE user_id IN (?) AND product_id IN (?)", [userIds, productIds]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_addresses WHERE user_id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_notifications WHERE user_id IN (?) AND title LIKE ?", [userIds, `${DEMO_NOTIFICATION_PREFIX}%`]),
        query(connection, "SELECT COUNT(*) AS count FROM customer_sessions WHERE user_id IN (?)", [userIds]),
        query(connection, "SELECT COUNT(*) AS count FROM discounts WHERE discount_code IN (?)", [DEMO_SEED_PLAN.discounts.map((discount) => discount.code)]),
        query(connection, "SELECT COUNT(*) AS count FROM inventory_movements WHERE note LIKE ?", [`${DEMO_MOVEMENT_PREFIX}%`]),
        query(
            connection,
            "SELECT COUNT(*) AS count FROM order_status_events ose JOIN orders o ON o.id = ose.order_id WHERE o.user_id IN (?) AND o.stripe_checkout_session_id LIKE ? AND ose.note LIKE ?",
            [userIds, `${DEMO_ORDER_SESSION_PREFIX}%`, `${DEMO_MOVEMENT_PREFIX} order%`],
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
            WHERE o.user_id IN (?) AND o.stripe_checkout_session_id LIKE ?
              AND (u.id IS NULL OR oi.id IS NULL OR p.id IS NULL)`,
            [userIds, `${DEMO_ORDER_SESSION_PREFIX}%`],
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
                WHERE o.user_id IN (?) AND o.stripe_checkout_session_id LIKE ?
                GROUP BY o.id, o.total_price
                HAVING COUNT(oi.id) = 0
                    OR ROUND(o.total_price, 2) <> ROUND(COALESCE(SUM(oi.total_price), 0), 2)
            ) mismatches`,
            [userIds, `${DEMO_ORDER_SESSION_PREFIX}%`],
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
            [`${DEMO_MOVEMENT_PREFIX} order%`],
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
                    AND o.stripe_checkout_session_id LIKE ?
              )`,
            [productNames, userIds, `${DEMO_ORDER_SESSION_PREFIX}%`],
        ),
        query(
            connection,
            `SELECT COUNT(*) AS count
            FROM products p
            WHERE p.name IN (?)
              AND NOT EXISTS (
                  SELECT 1
                  FROM reviews r
                  WHERE r.product_id = p.id
                    AND r.user_id IN (?)
                    AND r.review_text LIKE ?
              )`,
            [productNames, userIds, "Digital-E demo review:%"],
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
        categories: firstCount(categories),
        brands: firstCount(brands),
        products: firstCount(products),
        productImages: firstCount(productImages),
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
    };

    const expected = {
        users: 4,
        categories: 8,
        brands: 16,
        products: 28,
        productImages: 28,
        carts: 4,
        cartItems: 13,
        orders: 8,
        orderItems: 31,
        reviews: 36,
        wishlists: 32,
        addresses: 4,
        notifications: 8,
        sessions: 8,
        discounts: 2,
        inventoryMovements: 22,
        statusEvents: 14,
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

    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Digital-E demo verification failed: ${JSON.stringify(actual)}`);
    }

    console.log(`Digital-E demo verified: ${JSON.stringify(actual)}`);
};

const main = async () => {
    assertLocalDatabaseTarget({
        dbHost: process.env.DB_HOST,
        databaseUrl: process.env.DATABASE_URL,
    });

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
        await verify(connection);
    } finally {
        connection.release();
        await pool.end();
    }
};

if (require.main === module) {
    main().catch((error) => {
        console.error("Digital-E demo verification failed:", error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error));
        process.exitCode = 1;
    });
}

module.exports = { main };
