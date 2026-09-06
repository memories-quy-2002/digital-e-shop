import "reflect-metadata";
import mysql from "mysql2/promise";

process.env.NODE_ENV = "test";

const fixtureProducts = [
    { sku: "E2E-COD-PLAYWRIGHT", name: "E2E COD Checkout Fixture", stock: 5 },
    { sku: "E2E-STRIPE-PLAYWRIGHT", name: "E2E Stripe Checkout Fixture", stock: 1 },
];

async function seedE2eProducts() {
    if (!process.env.DATABASE_URL) return;

    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    try {
        const [categoryRows] = await connection.query<Array<{ id: number }>>(
            "SELECT id FROM categories ORDER BY id LIMIT 1",
        );
        const [brandRows] = await connection.query<Array<{ id: number }>>(
            "SELECT id FROM brands ORDER BY id LIMIT 1",
        );
        const categoryId = categoryRows[0]?.id;
        const brandId = brandRows[0]?.id;
        if (!categoryId || !brandId) throw new Error("E2E fixture requires a seeded category and brand");

        for (const fixture of fixtureProducts) {
            await connection.query(
                `INSERT INTO products
                    (name, description, category_id, brand_id, price, sale_price, stock, main_image, specifications, sku)
                 VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?)
                 ON DUPLICATE KEY UPDATE stock = VALUES(stock), name = VALUES(name)`,
                [fixture.name, "Deterministic Playwright fixture", categoryId, brandId, 19.99, fixture.stock, "E2E fixture", fixture.sku],
            );
        }

        const [productRows] = await connection.query<Array<{ id: number }>>(
            "SELECT id FROM products WHERE sku IN (?, ?)",
            fixtureProducts.map((fixture) => fixture.sku),
        );
        const productIds = productRows.map((row) => row.id);
        if (productIds.length === 0) return;

        const placeholders = productIds.map(() => "?").join(", ");
        await connection.query(`DELETE FROM carts WHERE product_id IN (${placeholders})`, productIds);
        await connection.query(
            `DELETE ir FROM inventory_reservations ir
             JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
             WHERE ir.product_id IN (${placeholders})`,
            productIds,
        );
        await connection.query("DELETE FROM pending_checkouts WHERE user_id LIKE 'e2e-%'", []);
    } finally {
        await connection.end();
    }
}

async function bootstrapE2eServer() {
    const [{ Test }, { AppModule }, { configureHttpApp }, { FirebaseAdminAuthService }, { StripeService }, { TestFirebaseAdminAuthService }, { TestStripeService }] = await Promise.all([
        import("@nestjs/testing"),
        import("../src/app.module"),
        import("../src/main"),
        import("../src/auth/firebase-admin.service"),
        import("../src/stripe/stripe.service"),
        import("./test-firebase-admin.service"),
        import("./test-stripe.service"),
    ]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(FirebaseAdminAuthService)
        .useClass(TestFirebaseAdminAuthService)
        .overrideProvider(StripeService)
        .useClass(TestStripeService)
        .compile();

    await seedE2eProducts();

    const app = moduleRef.createNestApplication({ rawBody: true });
    await configureHttpApp(app);
    await app.listen(4000, "127.0.0.1");
}

bootstrapE2eServer().catch((error: unknown) => {
    console.error("Unable to start the E2E server", error);
    process.exitCode = 1;
});
