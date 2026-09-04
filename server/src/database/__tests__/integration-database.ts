import mysql, { type Pool, type ResultSetHeader } from "mysql2/promise";
import { randomUUID } from "node:crypto";
import legacyPool from "#src/config/database.config";

const databaseUrl = new URL(
    process.env.DATABASE_URL || "mysql://ci_user:ci_password@127.0.0.1:3306/digital_e_shop_ci",
);

export const integrationPool: Pool = mysql.createPool({
    host: process.env.DB_HOST || databaseUrl.hostname,
    port: Number(process.env.DB_PORT || databaseUrl.port || 3306),
    user: process.env.DB_USER || decodeURIComponent(databaseUrl.username),
    password: process.env.DB_PASSWORD || decodeURIComponent(databaseUrl.password),
    database: process.env.DB_NAME || databaseUrl.pathname.replace(/^\//, ""),
    waitForConnections: true,
    connectionLimit: 4,
});

export const integrationPrefix = `ci_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

let userSequence = 0;

export type TestUser = {
    id: string;
    email: string;
    username: string;
};

export async function createTestUser(label: string): Promise<TestUser> {
    const id = `${integrationPrefix}-user-${label}`;
    const email = `${integrationPrefix}-${label}@example.test`;
    const username = `u${integrationPrefix.slice(-10)}${String.fromCharCode(97 + userSequence++)}`;

    await integrationPool.execute(
        `INSERT INTO users
            (id, email, password, username, first_name, last_name, role, token, created_at, last_login, status)
        VALUES (?, ?, ?, ?, NULL, NULL, 'Customer', ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 'Active')`,
        [id, email, "integration-password", username, "integration-token"],
    );

    return { id, email, username };
}

export async function createTestProduct(label: string, stock = 10): Promise<number> {
    const [result] = await integrationPool.execute<ResultSetHeader>(
        `INSERT INTO products
            (name, description, category_id, brand_id, price, sale_price, stock, main_image, specifications, created_at, updated_at)
        VALUES (?, ?, 1, 1, 10.00, NULL, ?, NULL, NULL, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [`${integrationPrefix}-product-${label}`, "Integration test product", stock],
    );

    return Number(result.insertId);
}

export async function createTestOrder(userId: string, totalPrice = 10): Promise<number> {
    const [result] = await integrationPool.execute<ResultSetHeader>(
        `INSERT INTO orders
            (user_id, total_price, discount, shipping_address, payment_method, date_added)
        VALUES (?, ?, 0, 'Integration test address', 'cash', UTC_TIMESTAMP())`,
        [userId, totalPrice],
    );

    return Number(result.insertId);
}

export async function createTestPendingCheckout(
    userId: string,
    stripeSessionId: string,
    cart: unknown[],
    totalPrice = 10,
): Promise<void> {
    await integrationPool.execute(
        `INSERT INTO pending_checkouts
            (stripe_session_id, user_id, cart_json, total_price, discount, shipping_address)
        VALUES (?, ?, ?, ?, 0, 'Integration test address')`,
        [stripeSessionId, userId, JSON.stringify(cart), totalPrice],
    );
}

async function ignoreMissingTable(operation: () => Promise<unknown>): Promise<void> {
    try {
        await operation();
    } catch (error) {
        if ((error as { code?: string }).code !== "ER_NO_SUCH_TABLE") {
            throw error;
        }
    }
}

export async function cleanupTestData(): Promise<void> {
    const userPattern = `${integrationPrefix}%`;
    const productPattern = `${integrationPrefix}-product-%`;

    await ignoreMissingTable(() => integrationPool.execute(
        `DELETE FROM inventory_movements
        WHERE actor_id LIKE ? OR product_id IN (SELECT id FROM products WHERE name LIKE ?)`,
        [userPattern, productPattern],
    ));
    await ignoreMissingTable(() => integrationPool.execute(
        `DELETE FROM order_status_events
        WHERE actor_id LIKE ? OR order_id IN (SELECT id FROM orders WHERE user_id LIKE ?)`,
        [userPattern, userPattern],
    ));
    await integrationPool.execute(
        "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id LIKE ?)",
        [userPattern],
    );
    await integrationPool.execute("DELETE FROM pending_checkouts WHERE user_id LIKE ?", [userPattern]);
    await integrationPool.execute("DELETE FROM customer_sessions WHERE user_id LIKE ?", [userPattern]);
    await integrationPool.execute("DELETE FROM orders WHERE user_id LIKE ?", [userPattern]);
    await integrationPool.execute("DELETE FROM products WHERE name LIKE ?", [productPattern]);
    await integrationPool.execute("DELETE FROM users WHERE id LIKE ?", [userPattern]);
}

export async function closeIntegrationPools(): Promise<void> {
    await integrationPool.end();

    await new Promise<void>((resolve, reject) => {
        const close = (legacyPool as unknown as {
            end: (callback: (error?: Error | null) => void) => void;
        }).end;

        close.call(legacyPool, (error?: Error | null) => (error ? reject(error) : resolve()));
    });
}
