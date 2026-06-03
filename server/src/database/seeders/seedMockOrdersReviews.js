const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const mysql = require("mysql");

const ORDER_COUNT = Number(process.env.MOCK_ORDER_COUNT || process.argv[2]) || 20;
const REVIEW_COUNT = Number(process.env.MOCK_REVIEW_COUNT || process.argv[3]) || 20;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
});

const query = (sql, params = []) =>
    new Promise((resolve, reject) => {
        pool.query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });

const sample = (items, index) => items[index % items.length];
const cents = (value) => Number(Number(value).toFixed(2));
const dateDaysAgo = (daysAgo) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - daysAgo);
    date.setUTCHours(9 + (daysAgo % 10), (daysAgo * 7) % 60, 0, 0);
    return date.toISOString().slice(0, 19).replace("T", " ");
};

const reviewTexts = [
    "Great quality and exactly what I needed for my setup.",
    "Fast delivery, clean packaging, and the product works well.",
    "Good value for the price. I would recommend it.",
    "The product feels reliable and matches the description.",
    "Solid performance after a few days of use.",
    "Nice upgrade for my workspace. Setup was simple.",
    "Everything arrived safely and worked out of the box.",
    "The sale price made this a very good purchase.",
    "Helpful product details and no surprise at checkout.",
    "Works well, though I would like more color options.",
];

const addresses = [
    "12 Nguyen Hue Street, District 1, Ho Chi Minh City",
    "45 Le Loi Street, District 3, Ho Chi Minh City",
    "88 Vo Van Tan Street, District 3, Ho Chi Minh City",
    "27 Tran Hung Dao Street, District 5, Ho Chi Minh City",
    "101 Pasteur Street, District 1, Ho Chi Minh City",
    "19 Ly Thuong Kiet Street, District 10, Ho Chi Minh City",
];

async function getCustomers() {
    const customers = await query(
        `SELECT id, username
        FROM users
        WHERE role = 'Customer'
        ORDER BY created_at DESC, id DESC
        LIMIT 12`
    );

    if (customers.length > 0) {
        return customers;
    }

    return query("SELECT id, username FROM users ORDER BY created_at DESC, id DESC LIMIT 12");
}

async function getProducts() {
    return query(
        `SELECT id, name, price, sale_price, stock
        FROM products
        WHERE stock >= 0
        ORDER BY id DESC
        LIMIT 40`
    );
}

async function seedOrders(customers, products) {
    const createdOrders = [];

    for (let index = 0; index < ORDER_COUNT; index += 1) {
        const customer = sample(customers, index);
        const itemCount = 1 + (index % 4);
        const chosenProducts = [];

        for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
            chosenProducts.push(sample(products, index * 3 + itemIndex));
        }

        const items = chosenProducts.map((product, itemIndex) => {
            const quantity = 1 + ((index + itemIndex) % 2);
            const unitPrice = Number(product.sale_price ?? product.price) || 0;
            return {
                product,
                quantity,
                totalPrice: cents(unitPrice * quantity),
            };
        });

        const grossTotal = cents(items.reduce((sum, item) => sum + item.totalPrice, 0));
        const discount = index % 5 === 0 ? cents(grossTotal * 0.1) : 0;
        const status = index % 9 === 0 ? 2 : index % 3 === 0 ? 0 : 1;
        const paymentMethod = index % 2 === 0 ? "bank_transfer" : "cash";
        const dateAdded = dateDaysAgo(index);

        const orderResult = await query(
            `INSERT INTO orders
                (user_id, total_price, discount, shipping_address, payment_method, date_added, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                customer.id,
                grossTotal,
                discount,
                sample(addresses, index),
                paymentMethod,
                dateAdded,
                status,
            ]
        );

        const orderId = orderResult.insertId;
        const orderItems = items.map((item) => [orderId, item.product.id, item.quantity, item.totalPrice]);
        await query(
            "INSERT INTO order_items (order_id, product_id, quantity, total_price) VALUES ?",
            [orderItems]
        );

        createdOrders.push({
            id: orderId,
            userId: customer.id,
            items,
        });
    }

    return createdOrders;
}

async function seedReviews(createdOrders) {
    const pairs = [];
    createdOrders.forEach((order) => {
        order.items.forEach((item) => {
            pairs.push({
                userId: order.userId,
                productId: item.product.id,
                productName: item.product.name,
            });
        });
    });

    const createdReviews = [];
    const seenPairs = new Set();

    for (let index = 0; index < pairs.length && createdReviews.length < REVIEW_COUNT; index += 1) {
        const pair = pairs[index];
        const key = `${pair.userId}:${pair.productId}`;
        if (seenPairs.has(key)) {
            continue;
        }
        seenPairs.add(key);

        const rating = 3 + (index % 3);
        const reviewText = sample(reviewTexts, index);
        const createdAt = dateDaysAgo(index + 1);

        await query(
            `INSERT INTO reviews (user_id, product_id, rating, review_text, created_at)
            VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                rating = VALUES(rating),
                review_text = VALUES(review_text),
                created_at = VALUES(created_at)`,
            [pair.userId, pair.productId, rating, reviewText, createdAt]
        );

        createdReviews.push(pair);
    }

    return createdReviews;
}

async function main() {
    const [customers, products] = await Promise.all([getCustomers(), getProducts()]);

    if (customers.length === 0) {
        throw new Error("No users found. Create at least one customer account before seeding mock orders.");
    }

    if (products.length === 0) {
        throw new Error("No products found. Add products before seeding mock orders.");
    }

    const createdOrders = await seedOrders(customers, products);
    const createdReviews = await seedReviews(createdOrders);

    console.log(`Seeded ${createdOrders.length} mock orders.`);
    console.log(`Seeded ${createdReviews.length} mock reviews.`);
    console.log("Refresh Admin Dashboard, Admin Orders, Product pages, and Analytics to view the data.");
}

main()
    .catch((err) => {
        console.error("Mock seed failed:", err.message);
        process.exitCode = 1;
    })
    .finally(() => {
        pool.end();
    });
