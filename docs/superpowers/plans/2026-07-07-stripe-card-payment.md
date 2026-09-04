# Stripe Card Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note for this run:** per explicit user instruction, do **NOT** commit or push during implementation. Every "Commit" step below is written for normal use of this plan, but for this run: skip the `git commit`/`git push` commands, leave the changes as uncommitted working-tree edits, and just check the step off once the code change itself is done. The user will review the diff and decide when to commit.

**Goal:** Add a "Card" payment method to checkout, backed by Stripe Checkout (hosted redirect), where the order and stock decrement are created only after a webhook confirms payment.

**Architecture:** A new `pending_checkouts` table holds the validated cart between "Stripe Checkout Session created" and "payment confirmed." The existing `makePurchase` transaction logic (stock locking, order insert, order_items insert, stock decrement) is extracted into a shared function `createOrderFromValidatedCart`, reused by both the existing synchronous bank_transfer/cash flow and the new webhook handler. The webhook route is registered in `app.ts` ahead of the global JSON/CSRF middleware so it can read the raw body for Stripe signature verification without touching the CSRF exemption list.

**Tech Stack:** Express 5, `stripe` Node SDK, MySQL (raw `mysql` package, callback style), Zod validation, React 19, Vitest.

**Reference:** Full design rationale in `docs/superpowers/specs/2026-07-07-stripe-card-payment-design.md`. Read it before starting — this plan implements it task-by-task but doesn't repeat the "why."

---

### Task 1: Database schema

**Files:**
- Create: `server/src/database/migrations/2026-07-07-add-stripe-payment-support.sql`
- Modify: `server/src/database/prisma/schema.prisma`

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE TABLE `pending_checkouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `stripe_session_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `user_id` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `cart_json` text COLLATE utf8mb4_general_ci NOT NULL,
  `total_price` decimal(11,2) NOT NULL,
  `discount` decimal(11,2) NOT NULL DEFAULT '0.00',
  `shipping_address` text COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `consumed_at` datetime NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pending_checkouts_session` (`stripe_session_id`),
  KEY `idx_pending_checkouts_user` (`user_id`),
  CONSTRAINT `fk_pending_checkouts_user_id` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

ALTER TABLE `orders`
  ADD COLUMN `stripe_checkout_session_id` varchar(255) COLLATE utf8mb4_general_ci NULL DEFAULT NULL AFTER `payment_method`,
  ADD COLUMN `stripe_payment_intent_id` varchar(255) COLLATE utf8mb4_general_ci NULL DEFAULT NULL AFTER `stripe_checkout_session_id`;
```

- [ ] **Step 2: Apply it to your local dev database**

Run against your local MySQL connection (adjust host/user/db to your `.env` values):

```bash
mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p <DB_NAME> < server/src/database/migrations/2026-07-07-add-stripe-payment-support.sql
```

Expected: no errors; `SHOW TABLES LIKE 'pending_checkouts';` returns one row.

- [ ] **Step 3: Update the Prisma schema to match**

In `server/src/database/prisma/schema.prisma`, add `pendingCheckouts PendingCheckout[]` to the `User` model's relation list (next to the existing `orders Order[]`, `carts Cart[]`, `reviews Review[]`), then update the `Order` model and add a new `PendingCheckout` model:

```prisma
model Order {
  id              Int      @id @default(autoincrement())
  userId          String   @map("user_id") @db.VarChar(255)
  totalPrice      Decimal  @map("total_price") @db.Decimal(11, 2)
  discount        Decimal  @default(0) @db.Decimal(11, 2)
  shippingAddress String   @map("shipping_address") @db.Text
  paymentMethod   String   @map("payment_method") @default("cash") @db.VarChar(32)
  stripeCheckoutSessionId String? @map("stripe_checkout_session_id") @db.VarChar(255)
  stripePaymentIntentId   String? @map("stripe_payment_intent_id") @db.VarChar(255)
  dateAdded       DateTime @map("date_added") @default(now()) @db.DateTime(0)
  status          Int      @default(0)

  user  User        @relation(fields: [userId], references: [id])
  items OrderItem[]

  @@map("orders")
}

model PendingCheckout {
  id              Int       @id @default(autoincrement())
  stripeSessionId String    @unique @map("stripe_session_id") @db.VarChar(255)
  userId          String    @map("user_id") @db.VarChar(255)
  cartJson        String    @map("cart_json") @db.Text
  totalPrice      Decimal   @map("total_price") @db.Decimal(11, 2)
  discount        Decimal   @default(0) @db.Decimal(11, 2)
  shippingAddress String    @map("shipping_address") @db.Text
  createdAt       DateTime  @map("created_at") @default(now()) @db.DateTime(0)
  consumedAt      DateTime? @map("consumed_at") @db.DateTime(0)

  user User @relation(fields: [userId], references: [id])

  @@map("pending_checkouts")
}
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm --filter server prisma:generate`
Expected: succeeds with no schema validation errors.

- [ ] **Step 5: Commit**

```bash
git add server/src/database/migrations/2026-07-07-add-stripe-payment-support.sql server/src/database/prisma/schema.prisma
git commit -m "feat(server): add pending_checkouts table and stripe order columns"
```

---

### Task 2: Stripe SDK, env config, and client module

**Files:**
- Modify: `server/package.json` (add dependency)
- Modify: `server/src/config/env.config.ts`
- Create: `server/src/config/stripe.config.ts`

- [ ] **Step 1: Install the Stripe SDK**

Run: `pnpm --filter server add stripe`
Expected: `stripe` appears in `server/package.json` dependencies.

- [ ] **Step 2: Add the two new env vars**

In `server/src/config/env.config.ts`, add to the `env` object (after `searchApiKey`):

```ts
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
```

- [ ] **Step 3: Create the Stripe client module**

Create `server/src/config/stripe.config.ts`:

```ts
import Stripe from "stripe";
import { env } from "./env.config";

export const stripeClient = new Stripe(env.stripeSecretKey);
```

Do not pin an `apiVersion` option — let the installed SDK version's default apply, so it isn't hand-typed to a possibly-wrong string.

- [ ] **Step 4: Add the vars to your local `.env`**

Add to your local `server/.env` (not committed):

```env
STRIPE_SECRET_KEY=<your-stripe-test-secret-key>
STRIPE_WEBHOOK_SECRET=<from-stripe-cli-listen-output>
```

- [ ] **Step 5: Verify the server still boots**

Run: `pnpm --filter server typecheck`
Expected: PASS (no type errors from the new module/env fields).

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/pnpm-lock.yaml server/src/config/env.config.ts server/src/config/stripe.config.ts
git commit -m "feat(server): add stripe SDK and client config"
```

---

### Task 3: Extract shared order-creation transaction logic

**Files:**
- Modify: `server/src/modules/orders/orders.service.ts:32-273` (the `makePurchase` function)

This is the highest-risk task: it must not change behavior for the existing bank_transfer/cash flow.

- [ ] **Step 1: Rename and generalize the transactional core**

In `server/src/modules/orders/orders.service.ts`, replace the `makePurchase` function (lines 32-273) with two functions: a new `createOrderFromValidatedCart` that contains everything from `const connection = (await getConnection())` onward (the whole transaction + post-commit side effects), generalized to accept its inputs as one object instead of reading `cart`/`discount`/etc. from the outer closure — and a slimmed-down `makePurchase` that does the pre-transaction validation (unchanged) and then calls `createOrderFromValidatedCart`.

Two behavior changes inside the extracted function, both required for the webhook caller and both no-ops for the existing `makePurchase` caller:

1. A new `allowOversell` flag. When `true`, the stock-insufficient/product-missing checks log an error and continue instead of throwing `createCheckoutError`.
2. The stock decrement UPDATE uses `GREATEST(..., 0)` so it can never go negative — harmless for the normal path (stock never goes negative there because of the pre-check), required for the oversell path.
3. The order INSERT gains two more columns/params: `stripe_checkout_session_id`, `stripe_payment_intent_id` (both `null` for bank_transfer/cash).

```ts
type CreateOrderFromCartInput = {
    uid: string;
    authoritativeCart: CartItemRow[];
    authoritativeTotalPrice: number;
    discount: number;
    shippingAddress: string;
    paymentMethod: string;
    allowOversell?: boolean;
    stripeCheckoutSessionId?: string | null;
    stripePaymentIntentId?: string | null;
};

async function createOrderFromValidatedCart({
    uid,
    authoritativeCart,
    authoritativeTotalPrice,
    discount,
    shippingAddress,
    paymentMethod,
    allowOversell = false,
    stripeCheckoutSessionId = null,
    stripePaymentIntentId = null,
}: CreateOrderFromCartInput) {
    const startedAt = Date.now();
    logger.info({ uid, items: authoritativeCart?.length, authoritativeTotalPrice, paymentMethod, allowOversell }, "[createOrderFromValidatedCart] start");

    const connection = (await getConnection()) as DbConnection;
    const query = util.promisify(connection.query).bind(connection);
    const begin = util.promisify(connection.beginTransaction).bind(connection);
    const commit = util.promisify(connection.commit).bind(connection);
    const rollback = util.promisify(connection.rollback).bind(connection);

    const q = <T = unknown>(sql: string, values?: unknown[]) =>
        query({ sql, timeout: QUERY_TIMEOUT }, values) as Promise<T>;

    let timeoutId;
    const timeoutMs = 8000;
    const timeout = new Promise((_, reject) => {
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

                inventoryMovements = [...productQuantities.entries()].map(([productId, quantity]) => {
                    const stockBefore = Number(stockById.get(productId)) || 0;
                    return {
                        productId,
                        orderId,
                        movementType: "sale",
                        quantityChange: -quantity,
                        stockBefore,
                        stockAfter: Math.max(stockBefore - quantity, 0),
                        note: `Stock deducted for order #${orderId}`,
                        actorId: uid,
                    };
                });

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
            orderTimelineService.recordTimelineEvent({
                orderId,
                status: 0,
                note: "Order was placed by the customer.",
                actorId: uid,
            });
            notificationService.notifyOrderPlaced(
                uid,
                orderId,
                Number(authoritativeTotalPrice) - Number(discount || 0),
            );
            inventoryMovementService.recordMovements(inventoryMovements);
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

async function makePurchase(
    uid: string,
    { totalPrice, cart, discount, shippingAddress, paymentMethod }: PurchasePayload,
) {
    if (!cart || cart.length === 0) {
        throw new Error("Cart is empty");
    }

    const checkoutValidation = (await cartService.validateCheckoutSubmission(
        uid,
        cart,
        totalPrice,
    )) as CheckoutValidationResult;
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

    return createOrderFromValidatedCart({
        uid,
        authoritativeCart: checkoutValidation.cartItems,
        authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice,
        discount,
        shippingAddress,
        paymentMethod,
    });
}
```

Keep `createCheckoutError`, the `DbConnection` type, `QUERY_TIMEOUT`, and `getConnection` exactly as they are today (just above `makePurchase`) — only the two functions above change.

- [ ] **Step 2: Add `createOrderFromValidatedCart` to the module exports**

At the bottom of `orders.service.ts`, add `createOrderFromValidatedCart` to the `module.exports` object (alongside the existing `makePurchase`, etc.).

- [ ] **Step 3: Typecheck and run the existing test suite**

Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server test`
Expected: both PASS. This task is a pure refactor — no existing test should change behavior. If `pnpm --filter server test` has no relevant existing coverage for `makePurchase`, that's expected (per `AGENTS.md`, there's no integration test suite yet); the typecheck passing plus a manual sanity check (place a test bank_transfer order locally through the UI) is the verification for this step.

- [ ] **Step 4: Manual sanity check**

Start the app (`pnpm --filter server dev` + `pnpm --filter client start`), place one bank_transfer order and one cash order through the existing checkout flow end-to-end. Expected: both succeed exactly as before (order appears in order history, stock decrements by the right amount).

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/orders/orders.service.ts
git commit -m "refactor(server): extract createOrderFromValidatedCart from makePurchase"
```

---

### Task 4: `pending_checkouts` repository and service wrappers

**Files:**
- Modify: `server/src/modules/orders/orders.repository.ts`
- Modify: `server/src/modules/orders/orders.types.ts`
- Modify: `server/src/modules/orders/orders.service.ts`

- [ ] **Step 1: Add the type**

In `server/src/modules/orders/orders.types.ts`, add:

```ts
export type PendingCheckoutRow = {
    id: number;
    stripe_session_id: string;
    user_id: string;
    cart_json: string;
    total_price: string;
    discount: string;
    shipping_address: string;
    created_at: string;
    consumed_at: string | null;
};
```

- [ ] **Step 2: Add repository functions**

In `server/src/modules/orders/orders.repository.ts`, add (mirroring the existing `insertOrder`/`updateCartDone` callback style already in that file):

```ts
const insertPendingCheckout = (
    input: {
        stripeSessionId: string;
        userId: string;
        cartJson: string;
        totalPrice: number;
        discount: number;
        shippingAddress: string;
    },
    callback: QueryCallback<InsertResult>,
) => {
    query(
        "INSERT INTO pending_checkouts (stripe_session_id, user_id, cart_json, total_price, discount, shipping_address) VALUES (?, ?, ?, ?, ?, ?)",
        [input.stripeSessionId, input.userId, input.cartJson, input.totalPrice, input.discount, input.shippingAddress],
        callback,
    );
};

const getPendingCheckoutBySessionId = (
    stripeSessionId: string,
    callback: QueryCallback<PendingCheckoutRow[]>,
) => {
    query("SELECT * FROM pending_checkouts WHERE stripe_session_id = ? LIMIT 1", [stripeSessionId], callback);
};

const markPendingCheckoutConsumed = (stripeSessionId: string, callback: QueryCallback<UpdateResult>) => {
    query("UPDATE pending_checkouts SET consumed_at = UTC_TIMESTAMP() WHERE stripe_session_id = ?", [stripeSessionId], callback);
};

const getOrderByStripeSessionId = (
    stripeSessionId: string,
    callback: QueryCallback<Array<{ id: number; user_id: string; date_added: string; payment_method: string }>>,
) => {
    query(
        `SELECT id, user_id, DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added, payment_method
        FROM orders WHERE stripe_checkout_session_id = ? LIMIT 1`,
        [stripeSessionId],
        callback,
    );
};
```

Add these four to the file's `module.exports`, and import `PendingCheckoutRow` from `./orders.types` at the top.

- [ ] **Step 3: Add promisified wrappers in `orders.service.ts`**

Add these functions (mirroring the existing `getOrders`/`getOrdersCount` promisify pattern already in the file), and add all four to `module.exports`:

```ts
async function insertPendingCheckout(input: {
    stripeSessionId: string;
    userId: string;
    cartJson: string;
    totalPrice: number;
    discount: number;
    shippingAddress: string;
}): Promise<void> {
    return new Promise((resolve, reject) => {
        Order.insertPendingCheckout(input, (err: Error | null) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function getPendingCheckoutBySessionId(stripeSessionId: string): Promise<PendingCheckoutRow | null> {
    return new Promise((resolve, reject) => {
        Order.getPendingCheckoutBySessionId(stripeSessionId, (err: Error | null, results: PendingCheckoutRow[]) => {
            if (err) return reject(err);
            resolve(results[0] || null);
        });
    });
}

async function markPendingCheckoutConsumed(stripeSessionId: string): Promise<void> {
    return new Promise((resolve, reject) => {
        Order.markPendingCheckoutConsumed(stripeSessionId, (err: Error | null) => {
            if (err) return reject(err);
            resolve();
        });
    });
}

async function getOrderBySessionId(
    stripeSessionId: string,
): Promise<{ id: number; user_id: string; date_added: string; payment_method: string } | null> {
    return new Promise((resolve, reject) => {
        Order.getOrderByStripeSessionId(stripeSessionId, (err: Error | null, results: Array<{ id: number; user_id: string; date_added: string; payment_method: string }>) => {
            if (err) return reject(err);
            resolve(results[0] || null);
        });
    });
}
```

Import `PendingCheckoutRow` from `./orders.types` at the top of `orders.service.ts`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/orders/orders.repository.ts server/src/modules/orders/orders.types.ts server/src/modules/orders/orders.service.ts
git commit -m "feat(server): add pending_checkouts data access"
```

---

### Task 5: Stripe checkout/webhook service, with idempotency test

**Files:**
- Create: `server/src/modules/orders/orders.stripe.service.ts`
- Test: `server/src/modules/orders/__tests__/orders.stripe.service.test.ts`

- [ ] **Step 1: Write the failing idempotency test first**

Create `server/src/modules/orders/__tests__/orders.stripe.service.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./orders.service", () => ({
    getPendingCheckoutBySessionId: vi.fn(),
    createOrderFromValidatedCart: vi.fn(),
    markPendingCheckoutConsumed: vi.fn(),
    insertPendingCheckout: vi.fn(),
}));
vi.mock("#src/modules/cart/cart.service", () => ({
    validateCheckoutSubmission: vi.fn(),
}));
vi.mock("#src/config/stripe.config", () => ({
    stripeClient: { checkout: { sessions: { create: vi.fn() } } },
}));
vi.mock("#src/shared/utils/logger", () => ({
    logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

import orderService from "../orders.service";
import stripeService from "../orders.stripe.service";
// This default-import-of-a-module.exports-object pattern matches the one
// already used in server/src/modules/inventory/__tests__/inventory.service.test.ts.

describe("handleCheckoutSessionCompleted", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not create a second order for an already-consumed session", async () => {
        (orderService.getPendingCheckoutBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 1,
            stripe_session_id: "cs_test_123",
            user_id: "user-1",
            cart_json: "[]",
            total_price: "10.00",
            discount: "0.00",
            shipping_address: "123 Main St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: "2026-07-07T00:01:00.000Z",
        });

        await stripeService.handleCheckoutSessionCompleted({ id: "cs_test_123", payment_intent: "pi_123" });

        expect(orderService.createOrderFromValidatedCart).not.toHaveBeenCalled();
        expect(orderService.markPendingCheckoutConsumed).not.toHaveBeenCalled();
    });

    it("creates the order and marks the session consumed on first delivery", async () => {
        (orderService.getPendingCheckoutBySessionId as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: 2,
            stripe_session_id: "cs_test_456",
            user_id: "user-2",
            cart_json: JSON.stringify([{ product_id: 1, quantity: 2, price: 5, product_name: "Widget" }]),
            total_price: "10.00",
            discount: "1.00",
            shipping_address: "456 Side St",
            created_at: "2026-07-07T00:00:00.000Z",
            consumed_at: null,
        });

        await stripeService.handleCheckoutSessionCompleted({ id: "cs_test_456", payment_intent: { id: "pi_456" } });

        expect(orderService.createOrderFromValidatedCart).toHaveBeenCalledWith({
            uid: "user-2",
            authoritativeCart: [{ product_id: 1, quantity: 2, price: 5, product_name: "Widget" }],
            authoritativeTotalPrice: 10,
            discount: 1,
            shippingAddress: "456 Side St",
            paymentMethod: "card",
            allowOversell: true,
            stripeCheckoutSessionId: "cs_test_456",
            stripePaymentIntentId: "pi_456",
        });
        expect(orderService.markPendingCheckoutConsumed).toHaveBeenCalledWith("cs_test_456");
    });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `pnpm --filter server test orders.stripe.service`
Expected: FAIL — `orders.stripe.service` module does not exist yet.

- [ ] **Step 3: Implement `orders.stripe.service.ts`**

Create `server/src/modules/orders/orders.stripe.service.ts`:

```ts
const cartService = require("#src/modules/cart/cart.service");
const orderService = require("./orders.service");
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import type { CheckoutValidationResult } from "#src/modules/cart/cart.types";
import type { CartCheckoutItem } from "#src/modules/cart/cart.dto";

const createCheckoutError = (message: string, statusCode = 409, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });

async function createCheckoutSession(
    uid: string,
    { totalPrice, cart, discount, shippingAddress }: { totalPrice: number; cart: CartCheckoutItem[]; discount: number; shippingAddress: string },
): Promise<{ url: string }> {
    const checkoutValidation = (await cartService.validateCheckoutSubmission(uid, cart, totalPrice)) as CheckoutValidationResult;

    if (checkoutValidation.cartItems.length === 0) {
        throw createCheckoutError("Your cart is empty. Refresh your cart and try again.", 400);
    }
    if (checkoutValidation.issues.length > 0) {
        throw createCheckoutError(
            "Some items in your cart are unavailable or no longer have enough stock. Update your cart and try again.",
            409,
            { issues: checkoutValidation.issues, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
        );
    }
    if (checkoutValidation.mismatches.length > 0) {
        throw createCheckoutError(
            "Your cart changed before checkout. Refresh your cart and confirm the latest prices and quantities.",
            409,
            { mismatches: checkoutValidation.mismatches, authoritativeCart: checkoutValidation.cartItems, authoritativeTotalPrice: checkoutValidation.authoritativeTotalPrice },
        );
    }

    const authoritativeCart = checkoutValidation.cartItems;
    const authoritativeTotalPrice = checkoutValidation.authoritativeTotalPrice;
    const payableTotal = Math.max(authoritativeTotalPrice - Number(discount || 0), 0);
    const itemCount = authoritativeCart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

    if (payableTotal <= 0) {
        throw createCheckoutError("Order total must be greater than zero to pay by card.", 400);
    }

    const session = await stripeClient.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    product_data: { name: `Digital-E order (${itemCount} item(s))` },
                    unit_amount: Math.round(payableTotal * 100),
                },
                quantity: 1,
            },
        ],
        success_url: `${env.clientUrl}/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.clientUrl}/cart`,
        metadata: { uid },
    });

    if (!session.url) {
        throw new Error("Stripe did not return a checkout URL");
    }

    await orderService.insertPendingCheckout({
        stripeSessionId: session.id,
        userId: uid,
        cartJson: JSON.stringify(authoritativeCart),
        totalPrice: authoritativeTotalPrice,
        discount: Number(discount || 0),
        shippingAddress,
    });

    return { url: session.url };
}

async function handleCheckoutSessionCompleted(session: { id: string; payment_intent: string | { id: string } | null }): Promise<void> {
    const pending = await orderService.getPendingCheckoutBySessionId(session.id);
    if (!pending) {
        logger.error({ sessionId: session.id }, "[handleCheckoutSessionCompleted] no pending checkout found for session");
        return;
    }
    if (pending.consumed_at) {
        logger.info({ sessionId: session.id }, "[handleCheckoutSessionCompleted] session already consumed, skipping");
        return;
    }

    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null;

    await orderService.createOrderFromValidatedCart({
        uid: pending.user_id,
        authoritativeCart: JSON.parse(pending.cart_json),
        authoritativeTotalPrice: Number(pending.total_price),
        discount: Number(pending.discount),
        shippingAddress: pending.shipping_address,
        paymentMethod: "card",
        allowOversell: true,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
    });

    await orderService.markPendingCheckoutConsumed(session.id);
}

module.exports = { createCheckoutSession, handleCheckoutSessionCompleted };
```

- [ ] **Step 4: Run the test again**

Run: `pnpm --filter server test orders.stripe.service`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/modules/orders/orders.stripe.service.ts server/src/modules/orders/__tests__/orders.stripe.service.test.ts
git commit -m "feat(server): add stripe checkout session creation and webhook handling"
```

---

### Task 6: `POST /api/orders/checkout-session/:uid` endpoint

**Files:**
- Modify: `server/src/modules/orders/orders.validator.ts`
- Modify: `server/src/modules/orders/orders.controller.ts`
- Modify: `server/src/modules/orders/orders.routes.ts`

- [ ] **Step 1: Add the validator**

In `server/src/modules/orders/orders.validator.ts`, add (reusing the existing `requiredText`/`positiveInt`/`nonNegativeNumber` helpers already in that file):

```ts
export const checkoutSessionSchema = z.object({
    totalPrice: nonNegativeNumber("Total price"),
    cart: z.array(
        z.object({
            productId: positiveInt("Product id"),
            quantity: positiveInt("Quantity"),
            price: nonNegativeNumber("Price"),
            sale_price: z.union([nonNegativeNumber("Sale price"), z.null(), z.undefined()]).optional(),
        }),
    ).min(1, "Cart cannot be empty"),
    discount: nonNegativeNumber("Discount").default(0),
    shippingAddress: requiredText("Shipping address"),
});
```

- [ ] **Step 2: Add the controller function**

In `server/src/modules/orders/orders.controller.ts`, add `checkoutSessionSchema` to the destructured `require("./orders.validator")` import at the top, then add:

```ts
async function createCheckoutSession(req: AppRequest, res: AppResponse) {
    const uid = req.params.uid;
    let payload;

    try {
        payload = parseBody(checkoutSessionSchema, req.body);
    } catch (err) {
        return res.status(400).json({ msg: getValidationMessage(err) });
    }

    try {
        const result = await orderStripeService.createCheckoutSession(uid, payload);
        return res.status(200).json({ url: result.url, msg: "Checkout session created" });
    } catch (err) {
        const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
        const statusCode = error.statusCode || 500;
        logger.error({ err: error.message || err, details: statusCode === 500 ? undefined : error.details }, "[createCheckoutSession] error");
        return res.status(statusCode).json({
            msg: statusCode === 500 ? "Unable to start checkout right now" : error.message,
            ...(statusCode === 500 ? {} : error.details || {}),
        });
    }
}
```

Add `const orderStripeService = require("./orders.stripe.service");` near the top with the other requires, and add `createCheckoutSession` to `module.exports`.

- [ ] **Step 3: Add the route**

In `server/src/modules/orders/orders.routes.ts`, add `createCheckoutSession` to the destructured controller import, then add (right after the existing `router.post("/purchase/:uid", ...)` line):

```ts
router.post("/checkout-session/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), createCheckoutSession);
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/orders/orders.validator.ts server/src/modules/orders/orders.controller.ts server/src/modules/orders/orders.routes.ts
git commit -m "feat(server): add checkout-session endpoint for card payments"
```

---

### Task 7: Stripe webhook route

**Files:**
- Create: `server/src/modules/orders/orders.stripeWebhook.controller.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Create the webhook controller**

Create `server/src/modules/orders/orders.stripeWebhook.controller.ts`:

```ts
import type { Request, Response } from "express";
import type Stripe from "stripe";
import { stripeClient } from "#src/config/stripe.config";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
const orderStripeService = require("./orders.stripe.service");

export async function handleStripeWebhook(req: Request, res: Response) {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
        return res.status(400).send("Missing Stripe signature");
    }

    let event: Stripe.Event;
    try {
        event = stripeClient.webhooks.constructEvent(req.body as Buffer, signature, env.stripeWebhookSecret);
    } catch (err) {
        logger.error(err, "[stripeWebhook] signature verification failed");
        return res.status(400).send("Invalid signature");
    }

    try {
        if (event.type === "checkout.session.completed") {
            await orderStripeService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        }
        return res.status(200).json({ received: true });
    } catch (err) {
        logger.error(err, "[stripeWebhook] handler error");
        return res.status(500).json({ received: false });
    }
}
```

- [ ] **Step 2: Register the route in `app.ts` before the JSON/CSRF middleware**

In `server/src/app.ts`, add the import near the other route imports:

```ts
import { handleStripeWebhook } from "#src/modules/orders/orders.stripeWebhook.controller";
```

Then add this line immediately after `app.options(/.*/, cors());` and **before** `app.use(express.json());`:

```ts
app.post("/api/orders/webhooks/stripe", express.raw({ type: "application/json" }), handleStripeWebhook);
```

This must stay above `app.use(express.json())` — Stripe's signature check needs the raw request body, and because this route's handler always sends its own response, the request never reaches the global JSON parser or `csrfProtection` for this path, so no change to the CSRF skip-list is needed.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 4: Local webhook smoke test (requires Stripe CLI + your test keys)**

```bash
stripe listen --forward-to localhost:4000/api/orders/webhooks/stripe
stripe trigger checkout.session.completed
```

Expected: server logs show `[handleCheckoutSessionCompleted] no pending checkout found for session` (expected, since `stripe trigger` fabricates a session with no matching `pending_checkouts` row) and the webhook responds 200. This confirms signature verification and routing work; the full flow is exercised in Task 9's manual test.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/orders/orders.stripeWebhook.controller.ts server/src/app.ts
git commit -m "feat(server): add stripe webhook endpoint"
```

---

### Task 8: `GET /api/orders/by-session/:sessionId` endpoint

**Files:**
- Modify: `server/src/modules/orders/orders.controller.ts`
- Modify: `server/src/modules/orders/orders.routes.ts`

- [ ] **Step 1: Add the controller function**

In `server/src/modules/orders/orders.controller.ts`, add (mirroring the existing `getOrderDetail` ownership-check pattern):

```ts
async function getOrderBySessionId(req: AppRequest, res: AppResponse) {
    const { sessionId } = req.params;

    try {
        const order = await orderService.getOrderBySessionId(sessionId);
        if (!order) {
            return res.status(404).json({ msg: "Order not ready yet" });
        }

        const isOwner = req.user?.id === order.user_id;
        const isAdmin = String(req.user?.role || "").toLowerCase() === "admin";
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ msg: "Forbidden" });
        }

        return res.status(200).json({ order, msg: "Order retrieved successfully" });
    } catch (err) {
        logger.error(err);
        return res.status(500).json({ msg: err.message });
    }
}
```

Add `getOrderBySessionId` to `module.exports`.

- [ ] **Step 2: Add the route**

In `server/src/modules/orders/orders.routes.ts`, add `getOrderBySessionId` to the destructured controller import, then add:

```ts
router.get("/by-session/:sessionId", orderLimiter, requireAuth, getOrderBySessionId);
```

Place it above `router.get("/:oid", ...)` so the literal `by-session` segment isn't swallowed by the `:oid` param route.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter server typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/orders/orders.controller.ts server/src/modules/orders/orders.routes.ts
git commit -m "feat(server): add by-session order lookup for stripe redirect polling"
```

---

### Task 9: Frontend — Card payment option

**Files:**
- Modify: `client/src/features/orders/components/CheckoutPaymentPage.tsx`

- [ ] **Step 1: Add "Card" to `paymentOptions` and the form type**

In `CheckoutPaymentPage.tsx`, change the `CheckoutForm.payment_method` type (line 26) to `"bank_transfer" | "cash" | "card"`, and add a third entry to `paymentOptions` (after `cash`, using the existing `CreditCardIcon` if one exists in `client/src/components/common/Icons`, otherwise reuse `ShieldIcon`):

```tsx
        {
            value: "card" as const,
            title: "Card",
            eyebrow: "Instant confirmation",
            description: "Pay securely by card via Stripe. You'll be redirected to complete payment.",
            meta: "Visa, Mastercard, and more",
            icon: <ShieldIcon size={22} />,
        },
```

- [ ] **Step 2: Branch `handlePurchase` on the selected payment method**

Replace the body of `handlePurchase` from the `try { setIsSubmitting(true); ... }` block onward with a branch: keep the existing `bank_transfer`/`cash` path exactly as-is (calling `/api/orders/purchase/${uid}`), and add a new `card` path that calls the checkout-session endpoint, stashes display data in `sessionStorage` under a new key `checkoutPending`, and redirects:

```tsx
        try {
            setIsSubmitting(true);
            const latestTotalPrice = latestCart.reduce(
                (sum, item) => sum + (item.sale_price ?? item.price) * item.quantity,
                0,
            );

            if (formCheckout.payment_method === "card") {
                sessionStorage.setItem(
                    "checkoutPending",
                    JSON.stringify({
                        totalPrice: latestTotalPrice,
                        discount,
                        subtotal: latestTotalPrice - discount,
                        itemsCount: latestCart.reduce((sum, item) => sum + item.quantity, 0),
                        email: formCheckout.email,
                        name: `${formCheckout.first_name} ${formCheckout.last_name}`.trim(),
                        address: formCheckout.address,
                        city: formCheckout.city,
                        country: formCheckout.country || "",
                        phone: formCheckout.phone_number || "",
                    }),
                );
                const sessionResponse = await http.post(`/api/orders/checkout-session/${uid}`, {
                    cart: latestCart,
                    totalPrice: latestTotalPrice,
                    discount,
                    shippingAddress: formCheckout.address,
                });
                if (sessionResponse.data?.url) {
                    window.location.href = sessionResponse.data.url;
                }
                return;
            }

            const response = await http.post(`/api/orders/purchase/${uid}`, {
                cart: latestCart,
                totalPrice: latestTotalPrice,
                discount,
                shippingAddress: formCheckout.address,
                paymentMethod: formCheckout.payment_method,
            });
            if (response.status === 201) {
                const orderId =
                    response.data?.order?.id ||
                    response.data?.orderId ||
                    response.data?.id ||
                    `ORD-${Date.now()}`;
                const placedAt = response.data?.order?.date_added || response.data?.placedAt || toUtcIsoString();
                const payload = {
                    orderId,
                    totalPrice: latestTotalPrice,
                    discount,
                    subtotal: latestTotalPrice - discount,
                    itemsCount: latestCart.reduce((sum, item) => sum + item.quantity, 0),
                    placedAt,
                    paymentMethod: formCheckout.payment_method,
                };
                const payloadSensitive = {
                    ...payload,
                    email: formCheckout.email,
                    name: `${formCheckout.first_name} ${formCheckout.last_name}`.trim(),
                    address: formCheckout.address,
                    city: formCheckout.city,
                    country: formCheckout.country || "",
                    phone: formCheckout.phone_number || "",
                };
                sessionStorage.setItem("checkoutSuccess", JSON.stringify(payload));
                navigate("/checkout-success", { state: { checkoutSuccess: payloadSensitive } });
            }
        } catch (err: unknown) {
```

(The `catch` block below stays exactly as it is today — the 409 validation-issue handling applies identically to the `checkout-session` endpoint's error shape.)

- [ ] **Step 3: Manual check**

Run `pnpm --filter client build` to confirm no type errors, then manually select "Card" in the checkout UI and confirm clicking "Place order" attempts a redirect (it will fail without real Stripe keys configured — that's expected until Task 2's env vars are filled in with real test keys).

- [ ] **Step 4: Commit**

```bash
git add client/src/features/orders/components/CheckoutPaymentPage.tsx
git commit -m "feat(client): add card payment option to checkout"
```

---

### Task 10: Frontend — success page polling for Stripe redirect

**Files:**
- Modify: `client/src/features/orders/pages/CheckoutSuccessPage.tsx`

- [ ] **Step 1: Add session-id polling**

`CheckoutSuccessPage` already has a `combinedData` fallback chain (`routeData || orderData` from `sessionStorage["checkoutSuccess"]`). Add a third source for the Stripe redirect case: read `?session_id=` from the URL, and if present with no `routeData`/`orderData` already resolved, poll `GET /api/orders/by-session/:sessionId` and merge the result with the `checkoutPending` sessionStorage payload written in Task 9.

Add near the top of the component, alongside the existing `orderData` memo:

```tsx
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import http from "../../../lib/http";
```

Add state and an effect (after the existing `orderData` memo and its `useEffect`):

```tsx
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const [polledOrder, setPolledOrder] = useState<CheckoutSuccessData | null>(null);
    const [pollingTimedOut, setPollingTimedOut] = useState(false);

    const pollForOrder = useCallback(async (id: string) => {
        const pendingRaw = sessionStorage.getItem("checkoutPending");
        const pending = pendingRaw ? (JSON.parse(pendingRaw) as Omit<CheckoutSuccessData, "orderId" | "placedAt" | "paymentMethod">) : null;

        for (let attempt = 0; attempt < 7; attempt += 1) {
            try {
                const response = await http.get(`/api/orders/by-session/${id}`);
                const order = response.data?.order;
                if (order?.id) {
                    setPolledOrder({
                        orderId: String(order.id),
                        totalPrice: pending?.totalPrice ?? 0,
                        discount: pending?.discount ?? 0,
                        subtotal: pending?.subtotal ?? pending?.totalPrice ?? 0,
                        itemsCount: pending?.itemsCount ?? 0,
                        placedAt: order.date_added,
                        paymentMethod: "card",
                        email: pending?.email,
                        name: pending?.name,
                        address: pending?.address,
                        city: pending?.city,
                        country: pending?.country,
                        phone: pending?.phone,
                    });
                    sessionStorage.removeItem("checkoutPending");
                    return;
                }
            } catch {
                // 404 while the webhook hasn't landed yet — keep polling.
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        setPollingTimedOut(true);
    }, []);

    useEffect(() => {
        if (sessionId && !routeData && !orderData) {
            pollForOrder(sessionId);
        }
    }, [sessionId, routeData, orderData, pollForOrder]);
```

Update the payment method type at the top of the file to include `"card"`:

```tsx
    paymentMethod?: "bank_transfer" | "cash" | "card";
```

And update `combinedData` and `paymentLabel`:

```tsx
    const combinedData = routeData || orderData || polledOrder;
    const paymentLabel =
        combinedData?.paymentMethod === "bank_transfer"
            ? "Bank transfer"
            : combinedData?.paymentMethod === "cash"
              ? "Cash on delivery"
              : combinedData?.paymentMethod === "card"
                ? "Card"
                : "Payment method pending";
```

- [ ] **Step 2: Show a friendly state while polling / on timeout**

Right after the opening `<main className="success app-page">`, add:

```tsx
                {sessionId && !combinedData && !pollingTimedOut ? (
                    <div className="checkout__note">Confirming your payment...</div>
                ) : null}
                {sessionId && !combinedData && pollingTimedOut ? (
                    <div className="checkout__alert">
                        Payment received — we&apos;re finalizing your order. Check{" "}
                        <Link to="/orders">My Orders</Link> shortly if it doesn&apos;t appear here.
                    </div>
                ) : null}
```

(`checkout__note`/`checkout__alert` classes already exist from `_cart.scss`/checkout styles — reuse them rather than adding new ones.)

- [ ] **Step 3: Verify the build**

Run: `client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit`
Run: `pnpm --filter client build`
Expected: both PASS.

- [ ] **Step 4: Manual check**

Since there are no live Stripe test keys yet, this can't be exercised end-to-end now. Once you add real test keys (Task 2, Step 4) and complete a test-mode Stripe Checkout payment, confirm you land on `/checkout-success?session_id=...` and the page fills in within a few seconds.

- [ ] **Step 5: Commit**

```bash
git add client/src/features/orders/pages/CheckoutSuccessPage.tsx
git commit -m "feat(client): poll for order confirmation after stripe redirect"
```

---

### Task 11: Wiki update and final verification

**Files:**
- Create: `Wiki/decisions/0002-stripe-webhook-driven-order-creation.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

- [ ] **Step 1: Write the decision record**

Create `Wiki/decisions/0002-stripe-webhook-driven-order-creation.md` summarizing: card payments use Stripe Checkout (hosted redirect); the order and stock decrement are created only inside the `checkout.session.completed` webhook, never before payment confirms; a `pending_checkouts` table bridges session-creation to webhook; refunds and itemized receipts are out of scope for v1; an oversell that occurs between session creation and webhook delivery is accepted and flagged for manual review rather than triggering an automatic refund. Link it from `Wiki/index.md`'s Decisions section per the existing `[[0001-...]]` pattern.

- [ ] **Step 2: Update `Wiki/architecture.md`**

Add a short section describing the new checkout path (new table, new endpoints, the app.ts webhook registration ordering) alongside the existing checkout/order documentation.

- [ ] **Step 3: Bump `Wiki/index.md`'s "Last updated" date and append to `Wiki/log.md`**

One line: date, what changed, link to the decision doc.

- [ ] **Step 4: Run full verification**

```bash
pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter server lint
pnpm --filter server test
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --filter client build
pnpm --filter client lint
```

Expected: all PASS. Report any that don't and why.

- [ ] **Step 5: Commit**

```bash
git add Wiki/decisions/0002-stripe-webhook-driven-order-creation.md Wiki/architecture.md Wiki/index.md Wiki/log.md
git commit -m "docs(wiki): document stripe webhook-driven order creation"
```
