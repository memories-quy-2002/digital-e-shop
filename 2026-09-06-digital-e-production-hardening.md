# Digital-E Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Digital-E from a portfolio-grade electronics storefront into a production-capable modular monolith by fixing authentication trust boundaries, eliminating paid oversell, making inventory/order history transactional, strengthening the electronics catalog model, enforcing promotion limits, and removing runtime schema mutation.

**Architecture:** Keep the existing React + NestJS modular monolith + MySQL architecture. Firebase remains the identity provider, but the NestJS API becomes the only trust boundary for identity/role; Stripe checkout gains database-backed stock reservations; MySQL transactions remain the consistency boundary for orders, stock, promotion redemption, and audit records. Do not introduce microservices, Kafka, Kubernetes, or a separate search engine in this plan.

**Tech Stack:** Node.js 24, TypeScript 6, NestJS 11, React, Firebase Auth + `firebase-admin`, MySQL 8.4, Prisma 7.10 migrations, Stripe 22, Vitest 4, Zod 4, `mysql2`, `ioredis`, GitHub Actions.

**Spec:** `docs/superpowers/plans/2026-09-06-digital-e-production-hardening.md#approved-design--implementation-specification` (self-contained in this file).

**Reviewed baseline:** `main@c921658c85c5966b2ea4e99586e6b2c9e4820239`. Re-scan changed files before execution if `main` has advanced.

## Global Constraints

- Keep the backend a **modular monolith**; no new distributed services.
- The client must never be authoritative for `uid`, `role`, price, stock, discount amount, or order total.
- Public registration always creates a `Customer`; admin privilege changes must use an authenticated admin-only backend flow.
- Access JWT lifetime is always **15 minutes**; `rememberMe` changes refresh-session persistence only.
- Stripe Checkout Session expiration is **30 minutes**; database reservation validity includes a **5-minute webhook-delivery grace window**.
- All stock deductions and inventory movement rows for an order must commit in the **same MySQL transaction**.
- Existing Stripe webhook signature verification and the unique `orders.stripe_checkout_session_id` idempotency constraint must remain intact.
- Prisma migrations own every schema change added by this plan. Runtime repositories must not execute `CREATE TABLE`, `ALTER TABLE`, or schema-discovery compatibility logic.
- Preserve backward compatibility for existing products/orders while new snapshot/specification columns are rolled out.
- Prefer existing dependencies. Add only `firebase-admin` for server-side Firebase verification; use the existing `ioredis` dependency for distributed rate limiting.
- Follow TDD for each behavior change: failing test first, minimal implementation, targeted green test, then affected regression suite.
- Do not rewrite existing migration history already deployed. Add forward-only migrations.

---

## Approved Design / Implementation Specification

### 1. Authentication trust boundary

Current email/password auth succeeds in Firebase on the client and then sends `uid + role` to the backend. The backend must instead receive a Firebase ID token, verify it with Firebase Admin, derive `uid/email` from the verified token, load the Digital-E user by verified `uid`, and derive authorization role only from MySQL.

Target login flow:

```text
Email/password
    |
    v
Firebase client SDK
    |
    | Firebase ID token
    v
POST /api/users/login
    |
    v
FirebaseAdminAuthService.verifyIdToken()
    |
    +--> verified uid/email
    |
    v
users table lookup
    |
    +--> server-owned role/status
    |
    v
15-minute access JWT + rotating refresh session
```

Public signup always persists `role = "Customer"`. The backend does not store the user's Firebase password; it stores a cryptographically random unusable placeholder hash in the legacy non-null `users.password` column until a separate schema cleanup removes that legacy column.

### 2. Refresh-session model

Bind each access token to an active server session using JWT claim `sid`. Store only a SHA-256 hash of the refresh token in `customer_sessions`.

- Non-remembered session: refresh expires after 8 hours; refresh cookie is a browser-session cookie.
- Remembered session: refresh expires after 30 days; refresh cookie receives `Max-Age=30d`.
- Every refresh rotates the token: old refresh token becomes invalid immediately.
- Logout revokes the session and clears all auth cookies.
- Guards verify JWT signature, `sid`, matching session cookie, active session, and user status.

### 3. Inventory reservation model

Do not decrement physical `products.stock` when a Stripe Checkout Session is merely opened. Reserve quantities in `inventory_reservations` and compute available stock as:

```text
available_stock = products.stock - SUM(active reservation quantities)
```

A reservation is active only while its parent `pending_checkouts.status = 'PENDING'`. The checkout row carries a 35-minute database expiry (30-minute Stripe expiry + 5-minute webhook grace). `checkout.session.expired` marks it `EXPIRED`; no stock restoration query is required because physical stock was never decremented.

Reservation creation serializes competing buyers by locking the involved `products` rows with `SELECT ... FOR UPDATE`, then checks existing active reservations and inserts the new reservation rows before committing.

### 4. Paid order finalization

`checkout.session.completed` finalizes exactly once:

1. Lock `pending_checkouts` row.
2. Return successfully if already `CONSUMED` and an order exists for the Stripe session.
3. Lock reservation/product rows.
4. Insert order.
5. Insert immutable order-item snapshots.
6. Decrement physical stock using reserved quantities.
7. Insert inventory movement rows in the same transaction.
8. Consume reserved promotion usage when present.
9. Mark pending checkout `CONSUMED`.
10. Commit.

Remove `allowOversell`; a paid session must never create a second, unreserved claim on stock.

### 5. Electronics product model

Avoid a premature variant subsystem. In this iteration, **one `Product` represents one sellable SKU**. Add:

- `sku` — Digital-E internal SKU, unique.
- `manufacturerPartNumber` — optional MPN, indexed.
- `warrantyMonths` — optional integer.
- `ProductAttribute` — typed structured specification rows for filtering.

Keep the legacy `products.specifications` text field as a display fallback while products are migrated. Structured attributes become authoritative for new filters.

### 6. Immutable order snapshots

Order history must not change when an admin edits a product later. Add snapshot fields to `order_items`: SKU, product name, image, unit price, brand, category, warranty months, and JSON specification snapshot. Existing rows may be null and fall back to current product joins until backfilled.

### 7. Promotion quota correctness

`usage_limit` must be enforced under concurrency.

- COD: lock discount row and insert a `CONSUMED` redemption in the same transaction as order creation.
- Stripe: reserve one usage slot before returning the Checkout URL; reservation counts against quota until consumed/released/expired.
- Count both active `RESERVED` and `CONSUMED` records when enforcing the global quota.
- `checkout.session.expired` releases the promotion reservation.

### 8. Schema ownership

Existing legacy baseline history remains untouched. All schema additions from this plan use forward Prisma migrations. Remove runtime DDL from `InventoryRepository` and `PromotionsRepository`; repositories should fail normally if deployment migrations were not applied.

### 9. Rate limiting

Use Redis in production for auth/payment limits and keep the in-memory limiter only for development/test. Implement a small `ioredis` fixed-window store with atomic `INCR + PEXPIRE`; fail closed only on sensitive auth endpoints if Redis is configured but unavailable, and fail open for catalog/read-only routes.

### 10. Explicit non-goals

This plan does **not** add supplier purchasing, multi-warehouse inventory, Kafka, microservices, Elasticsearch/OpenSearch, a full PC compatibility engine, or a ProductVariant abstraction. Those are separate scale/business projects after this consistency baseline is green.

---

## File Map

### New backend files

- `server/src/auth/firebase-admin.service.ts` — Firebase Admin singleton + verified identity interface.
- `server/src/auth/auth-session.service.ts` — access/refresh token issuance and rotation.
- `server/src/database/transaction.ts` — small typed adapter for callback-based `mysql2` transactions.
- `server/src/orders/checkout-reservation.service.ts` — stock/promotion reservation orchestration.
- `server/src/orders/checkout-reservation.repository.ts` — transaction-aware reservation SQL.
- `server/src/shared/rate-limit/redis-rate-limit.ts` — Redis-backed fixed-window limiter primitive.
- `server/src/products/product-attributes.repository.ts` — structured specification persistence/filter queries.
- `server/src/products/product-attributes.types.ts` — typed attribute contracts.
- `server/test/e2e-server.ts` — Nest E2E bootstrap using dependency-injected test adapters.
- `server/test/test-firebase-admin.service.ts` — deterministic Firebase verifier for E2E only.
- `server/test/test-stripe.service.ts` — deterministic Stripe adapter for E2E only.

### New migrations

- `server/src/database/prisma/migrations/20260906080000_secure_auth_sessions/migration.sql`
- `server/src/database/prisma/migrations/20260906090000_checkout_inventory_reservations/migration.sql`
- `server/src/database/prisma/migrations/20260906100000_promotion_redemptions/migration.sql`
- `server/src/database/prisma/migrations/20260906110000_product_sku_order_snapshots/migration.sql`
- `server/src/database/prisma/migrations/20260906120000_product_attributes/migration.sql`
- `server/src/database/prisma/migrations/20260906130000_audit_schema_ownership/migration.sql`

### Existing files with major changes

- `server/package.json`
- `server/.env.example`
- `server/src/config/env.config.ts`
- `server/src/database/prisma/schema.prisma`
- `server/src/auth/auth.module.ts`
- `server/src/auth/auth.validator.ts`
- `server/src/auth/auth.dto.ts`
- `server/src/auth/auth.types.ts`
- `server/src/auth/auth.repository.ts`
- `server/src/auth/auth.service.ts`
- `server/src/auth/auth.controller.ts`
- `server/src/auth/auth-flow.spec.ts`
- `server/src/guards/auth.guard.ts`
- `server/src/guards/__tests__/auth.guard.test.ts`
- `client/src/features/auth/api.ts`
- `client/src/features/auth/pages/LoginPage.tsx`
- `client/src/features/auth/pages/SignupPage.tsx`
- `client/src/types/product.ts`
- `client/src/utils/product.ts`
- `client/src/features/admin/api.ts`
- `client/src/features/admin/pages/AdminProductPage.tsx`
- `client/src/features/admin/pages/AdminAddProductPage.tsx`
- `server/src/orders/orders.service.ts`
- `server/src/orders/orders.repository.ts`
- `server/src/orders/orders.stripe.service.ts`
- `server/src/orders/orders.types.ts`
- `server/src/orders/__tests__/orders.integration.test.ts`
- `server/src/orders/__tests__/orders.stripe.service.test.ts`
- `server/src/stripe/stripeWebhook.controller.ts`
- `server/src/stripe/__tests__/stripeWebhook.controller.test.ts`
- `server/src/inventory/inventory.repository.ts`
- `server/src/inventory/inventory.service.ts`
- `server/src/promotions/promotions.repository.ts`
- `server/src/promotions/promotions.service.ts`
- `server/src/products/products.validator.ts`
- `server/src/products/products.dto.ts`
- `server/src/products/products.types.ts`
- `server/src/products/products.repository.ts`
- `server/src/products/products.service.ts`
- `server/src/middleware/rate-limit.middleware.ts`
- `server/src/main.ts`
- `server/src/docs/openapi.json`
- `.github/workflows/ci.yml`
- `Wiki/architecture.md`
- `server/README.prisma.md`

---

# Phase P0 — Security and Money/Stock Correctness

## Task 1: Make Firebase ID tokens the API identity boundary

**Files:**
- Modify: `server/package.json`
- Modify: `server/.env.example`
- Modify: `server/src/config/env.config.ts`
- Create: `server/src/auth/firebase-admin.service.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/auth/auth.validator.ts`
- Modify: `server/src/auth/auth.dto.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `client/src/features/auth/api.ts`
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Modify: `server/src/docs/openapi.json`
- Test: `server/src/auth/auth-flow.spec.ts`

**Interfaces:**
- Produces: `FirebaseIdentity { uid: string; email: string }`
- Produces: `FirebaseAdminAuthService.verifyIdToken(idToken: string): Promise<FirebaseIdentity>`
- Changes login contract to `POST /api/users/login { idToken: string, rememberMe?: boolean }`
- Changes registration contract to `POST /api/users/register { idToken: string, user: { username: string } }`
- Public registration always stores `role = "Customer"`.

- [ ] **Step 1: Add failing validator/controller contract tests**

Add cases to `server/src/auth/auth-flow.spec.ts` proving that `uid` and `role` are rejected and `idToken` is required.

```ts
expect(() => userLoginSchema.parse({ uid: "forged", role: "Admin" })).toThrow();
expect(userLoginSchema.parse({ idToken: "firebase-id-token", rememberMe: true })).toEqual({
    idToken: "firebase-id-token",
    rememberMe: true,
});

expect(() => registerUserSchema.parse({
    uid: "forged",
    user: { username: "attacker", role: "Admin" },
})).toThrow();
```

- [ ] **Step 2: Run the focused auth tests and confirm red**

```bash
pnpm --filter server test -- --run src/auth/auth-flow.spec.ts
```

Expected: failures because the current schema still accepts client `uid/role` and does not require `idToken`.

- [ ] **Step 3: Add Firebase Admin dependency and environment contract**

```bash
pnpm --filter server add firebase-admin
```

Add to `server/.env.example`:

```dotenv
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Extend `env` in `server/src/config/env.config.ts`:

```ts
firebaseProjectId: process.env.FIREBASE_PROJECT_ID || "",
firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
firebasePrivateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
```

- [ ] **Step 4: Implement the Firebase Admin verifier as a focused service**

Create `server/src/auth/firebase-admin.service.ts`:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "#src/config/env.config";

export type FirebaseIdentity = {
    uid: string;
    email: string;
};

@Injectable()
export class FirebaseAdminAuthService {
    private getAuthClient() {
        const app = getApps()[0] ?? initializeApp({
            credential: cert({
                projectId: env.firebaseProjectId,
                clientEmail: env.firebaseClientEmail,
                privateKey: env.firebasePrivateKey,
            }),
        });
        return getAuth(app);
    }

    async verifyIdToken(idToken: string): Promise<FirebaseIdentity> {
        try {
            const decoded = await this.getAuthClient().verifyIdToken(idToken, true);
            if (!decoded.email) throw new Error("Firebase token has no email");
            return { uid: decoded.uid, email: decoded.email.toLowerCase() };
        } catch {
            throw new UnauthorizedException({ msg: "Invalid Firebase ID token" });
        }
    }
}
```

Register/export it in `AuthModule`.

- [ ] **Step 5: Replace login/register Zod schemas**

Use:

```ts
export const userLoginSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    rememberMe: z.boolean().optional().default(false),
}).strict();

export const registerUserSchema = z.object({
    idToken: requiredText("Firebase ID token"),
    user: z.object({
        username: requiredText("Username").min(3).max(50),
    }).strict(),
}).strict();
```

The `.strict()` calls are intentional: forged `uid`, `email`, `password`, or `role` fields should fail validation rather than be silently ignored.

- [ ] **Step 6: Make backend identity and role authoritative**

Change service signatures to:

```ts
async loginUser(idToken: string, rememberMe = false)
async registerUser(idToken: string, input: { username: string })
```

Login behavior:

```ts
const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
const user = await this.usersRepository.findById(identity.uid);
if (!user || user.email.toLowerCase() !== identity.email) {
    throw new UnauthorizedException({ msg: "Account is not registered" });
}
if (user.status === "Suspended") {
    throw new UnauthorizedException({ msg: "Account is suspended" });
}
return this.issueLoginSession(user, rememberMe);
```

Registration behavior:

```ts
const identity = await this.firebaseAdminAuthService.verifyIdToken(idToken);
const existing = await this.usersRepository.findById(identity.uid);
if (existing) return this.issueLoginSession(existing, false);

const placeholderPassword = await hashPassword(crypto.randomBytes(32).toString("hex"));
await this.usersRepository.createUser(
    identity.uid,
    input.username,
    identity.email,
    placeholderPassword,
    "Customer",
);
```

Do not copy a role from the request.

- [ ] **Step 7: Update client login API and page**

`client/src/features/auth/api.ts`:

```ts
export async function loginUser(idToken: string, rememberMe: boolean): Promise<UserData> {
    const response = await http.post("/api/users/login", { idToken, rememberMe });
    return response.data.userData;
}
```

`LoginPage.tsx`:

```ts
const userCredential = await signInWithFirebaseEmail(user.email, user.password);
const idToken = await userCredential.user.getIdToken(true);
const userDataResult = await loginUser(idToken, rememberMe);
setUserData(userDataResult);
navigate(userDataResult.role === Role.Admin ? "/admin" : "/");
```

Remove the `Login as Customer/Admin` radio group and `handleChangeRadio`.

- [ ] **Step 8: Update client signup API and page**

After `createFirebaseUser(...)` or fallback sign-in:

```ts
const idToken = await userCredential.user.getIdToken(true);
await registerUser({ username: user.username }, idToken);
navigate("/");
```

Remove signup role state, role radio controls, and admin navigation branching.

- [ ] **Step 9: Update OpenAPI auth request contracts**

In `server/src/docs/openapi.json`, make `/api/users/login` accept only `idToken` and optional `rememberMe`, and `/api/users/register` accept only `idToken` plus `user.username`. Remove public request fields for `uid`, `role`, and backend password. Keep the existing response envelope shape.

- [ ] **Step 10: Run auth/client regression checks**

```bash
pnpm --filter server test -- --run src/auth/auth-flow.spec.ts
pnpm --filter server typecheck
pnpm --filter client exec tsc --noEmit
pnpm --filter client test -- --run
```

Expected: all green; public client UI no longer exposes role selection.

- [ ] **Step 11: Commit the identity-boundary fix**

```bash
git add server/package.json pnpm-lock.yaml server/.env.example server/src/config/env.config.ts \
  server/src/auth server/src/docs/openapi.json client/src/features/auth
git commit -m "fix(auth): verify Firebase identity on the server"
```

---

## Task 2: Replace long-lived access JWTs with rotating server sessions

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906080000_secure_auth_sessions/migration.sql`
- Create: `server/src/auth/auth-session.service.ts`
- Modify: `server/src/auth/auth.types.ts`
- Modify: `server/src/auth/auth.repository.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/guards/auth.guard.ts`
- Test: `server/src/auth/auth-flow.spec.ts`
- Test: `server/src/guards/__tests__/auth.guard.test.ts`

**Interfaces:**
- Produces: `AuthSessionService.issue(user, rememberMe)`
- Produces: `AuthSessionService.rotate(sessionId, rawRefreshToken)`
- Produces JWT payload `{ id, email, role, sid }`.
- Repository session lookup returns `user_id`, `refresh_token_hash`, `refresh_expires_at`, `revoked_at`, `session_end`.

- [ ] **Step 1: Write failing tests for access lifetime, session binding, and refresh replay**

Add assertions that:

```ts
// access token always 15m regardless of rememberMe
expect(signSpy).toHaveBeenCalledWith(
    expect.objectContaining({ sid: expect.any(Number) }),
    expect.any(String),
    expect.objectContaining({ expiresIn: "15m" }),
);

// rotating refresh rejects the previous token after a successful rotation
await expect(authSessionService.rotate(sessionId, oldRefresh)).rejects.toMatchObject({
    status: 401,
});
```

Update guard tests so a mismatched JWT `sid` / session cookie is rejected.

- [ ] **Step 2: Run focused tests and confirm red**

```bash
pnpm --filter server test -- --run src/auth/auth-flow.spec.ts src/guards/__tests__/auth.guard.test.ts
```

- [ ] **Step 3: Add forward migration for refresh-session state**

Migration SQL:

```sql
ALTER TABLE customer_sessions
    ADD COLUMN refresh_token_hash CHAR(64) NULL,
    ADD COLUMN refresh_expires_at DATETIME NULL,
    ADD COLUMN revoked_at DATETIME NULL,
    ADD COLUMN last_used_at DATETIME NULL,
    ADD INDEX customer_sessions_user_active_idx (user_id, revoked_at, refresh_expires_at);
```

Represent the legacy table in Prisma:

```prisma
model AuthSession {
  id               Int       @id @default(autoincrement())
  userId           String    @map("user_id") @db.VarChar(255)
  sessionStart     DateTime  @default(now()) @map("session_start") @db.DateTime(0)
  sessionEnd       DateTime? @map("session_end") @db.DateTime(0)
  refreshTokenHash String?   @map("refresh_token_hash") @db.Char(64)
  refreshExpiresAt DateTime? @map("refresh_expires_at") @db.DateTime(0)
  revokedAt        DateTime? @map("revoked_at") @db.DateTime(0)
  lastUsedAt       DateTime? @map("last_used_at") @db.DateTime(0)

  @@index([userId, revokedAt, refreshExpiresAt], map: "customer_sessions_user_active_idx")
  @@map("customer_sessions")
}
```

- [ ] **Step 4: Add repository methods that store only refresh-token hashes**

Use SHA-256 hex hashes:

```ts
const hashRefreshToken = (token: string) =>
    crypto.createHash("sha256").update(token).digest("hex");
```

Repository contract:

```ts
startSession(userId: string, refreshTokenHash: string, refreshExpiresAt: Date): Promise<number>
getActiveSessionById(sessionId: number | string): Promise<AuthSessionRow | null>
rotateRefreshToken(sessionId: number, expectedHash: string, nextHash: string, nextExpiry: Date): Promise<boolean>
revokeSession(sessionId: number | string): Promise<void>
```

`rotateRefreshToken` must use the old hash in the `WHERE` clause so two concurrent refresh requests cannot both succeed:

```sql
UPDATE customer_sessions
SET refresh_token_hash = ?, refresh_expires_at = ?, last_used_at = UTC_TIMESTAMP()
WHERE id = ?
  AND refresh_token_hash = ?
  AND revoked_at IS NULL
  AND session_end IS NULL
  AND refresh_expires_at > UTC_TIMESTAMP();
```

- [ ] **Step 5: Implement `AuthSessionService`**

Core rules:

```ts
const ACCESS_TTL = "15m" as const;
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REMEMBER_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");
```

`issue(...)` creates the refresh token first, stores its hash/expiry, then signs access JWT with `sid`.

`rotate(...)`:
1. hash supplied token;
2. load active session;
3. constant-time compare hashes;
4. generate next token/hash;
5. conditional update using old hash;
6. load the current user and sign a fresh 15-minute access JWT using DB role/status.

- [ ] **Step 6: Change cookies so `rememberMe` does not extend access JWT**

Keep access and session cookies HttpOnly. For a normal session, do not set `Max-Age` on refresh/session cookies. For remembered sessions, set 30 days. The raw refresh token must only be sent in the HttpOnly `refreshToken` cookie.

Do not expose refresh tokens in JSON.

- [ ] **Step 7: Bind guard verification to the active session**

After JWT verification:

```ts
if (String(payload.sid) !== String(req.cookies?.session)) {
    throw new UnauthorizedException({ msg: "Session mismatch" });
}

const session = await this.authRepository.getActiveSessionById(payload.sid);
if (!session || session.user_id !== payload.id) {
    throw new UnauthorizedException({ msg: "Session invalid or expired" });
}
```

Load the user and reject `Suspended`; set `req.user.role = user.role` so authorization is refreshed from DB rather than relying on stale JWT claims.

- [ ] **Step 8: Make `/refresh` rotate both cookies**

Controller response behavior:

```ts
const rotated = await this.authService.refreshToken(sessionId, refreshTokenCookie);
res.cookie("accessToken", rotated.accessToken, baseCookieOptions);
res.cookie("refreshToken", rotated.refreshToken, refreshCookieOptions);
return res.status(200).json(buildSuccessResponse({ msg: "Token refreshed successfully" }, requestId));
```

Do not return the access token in the response body unless existing client code demonstrably requires it; cookie auth is the source of truth.

- [ ] **Step 9: Run migration and regression tests**

```bash
pnpm --filter server prisma:validate
pnpm --filter server prisma:format
pnpm --filter server test -- --run src/auth/auth-flow.spec.ts src/guards/__tests__/auth.guard.test.ts
pnpm --filter server test -- --run
pnpm --filter server typecheck
```

- [ ] **Step 10: Commit session hardening**

```bash
git add server/src/database/prisma server/src/auth server/src/guards
git commit -m "feat(auth): rotate refresh sessions and bind access tokens"
```

---

## Task 3: Introduce a typed MySQL transaction adapter

**Files:**
- Create: `server/src/database/transaction.ts`
- Create: `server/src/database/__tests__/transaction.test.ts`
- Modify: `server/src/orders/orders.service.ts`

**Interfaces:**
- Produces: `TransactionContext.query<T>(sql: string, values?: unknown[]): Promise<T>`
- Produces: `withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>`
- Later reservation/order repositories consume `TransactionContext` rather than opening nested transactions.

- [ ] **Step 1: Write transaction lifecycle tests**

Test success sequence `begin -> work -> commit -> release` and failure sequence `begin -> work throws -> rollback -> release` using a mocked connection.

```ts
await expect(withTransaction(async (tx) => {
    await tx.query("SELECT 1");
    return 42;
})).resolves.toBe(42);
```

- [ ] **Step 2: Run the new test and confirm red**

```bash
pnpm --filter server test -- --run src/database/__tests__/transaction.test.ts
```

- [ ] **Step 3: Implement the adapter without replacing the global pool**

Expose a small wrapper around the existing callback pool:

```ts
export type TransactionContext = {
    query<T = unknown>(sql: string, values?: unknown[]): Promise<T>;
};

export async function withTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
): Promise<T> {
    const connection = await getConnection();
    try {
        await begin(connection);
        const tx = createTransactionContext(connection);
        const result = await work(tx);
        await commit(connection);
        return result;
    } catch (error) {
        await rollback(connection).catch((rollbackError) => {
            logger.error({ rollbackError }, "Transaction rollback failed");
        });
        throw error;
    } finally {
        connection.release();
    }
}
```

Keep the existing 8-second query timeout in `TransactionContext.query`.

- [ ] **Step 4: Refactor only `createOrderFromValidatedCart` to use the adapter**

Do not change business behavior in this step. The purpose is to prove the adapter with an existing high-value flow before reservations depend on it.

- [ ] **Step 5: Run order integration tests**

```bash
pnpm --filter server test -- --run src/orders/__tests__/orders.integration.test.ts
pnpm --filter server typecheck
```

- [ ] **Step 6: Commit the transaction boundary helper**

```bash
git add server/src/database server/src/orders/orders.service.ts
git commit -m "refactor(db): centralize transaction execution"
```

---

## Task 4: Add checkout inventory reservations

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906090000_checkout_inventory_reservations/migration.sql`
- Create: `server/src/orders/checkout-reservation.repository.ts`
- Create: `server/src/orders/checkout-reservation.service.ts`
- Modify: `server/src/orders/orders.types.ts`
- Modify: `server/src/orders/orders.module.ts`
- Modify: `server/src/products/products.repository.ts`
- Modify: `server/src/cart/cart.service.ts`
- Modify: `client/src/types/product.ts`
- Modify: `client/src/utils/product.ts`
- Test: `server/src/orders/__tests__/checkout-reservation.service.test.ts`
- Test: `server/src/orders/__tests__/orders.integration.test.ts`

**Interfaces:**
- Produces: `reserveInventory(input): Promise<CheckoutReservation>`
- Produces: `releaseReservation(reservationToken, reason): Promise<void>`
- Produces: `getAvailableQuantity(productId): Promise<number>`
- `CheckoutReservation` owns cart snapshot, pricing snapshot, address, expiry, and reserved items.

- [ ] **Step 1: Write concurrency-focused failing tests**

For stock `1`, two concurrent reservations of quantity `1` must produce exactly one success and one `409` failure.

```ts
const results = await Promise.allSettled([
    service.reserveInventory(inputFor("user-a", 1)),
    service.reserveInventory(inputFor("user-b", 1)),
]);

expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
```

Also test that an `EXPIRED`, `RELEASED`, or `CONSUMED` checkout no longer reduces available quantity.

- [ ] **Step 2: Run reservation test and confirm red**

```bash
pnpm --filter server test -- --run src/orders/__tests__/checkout-reservation.service.test.ts
```

- [ ] **Step 3: Extend `pending_checkouts` and add reservation items**

Migration SQL:

```sql
ALTER TABLE pending_checkouts
    MODIFY stripe_session_id VARCHAR(255) NULL,
    ADD COLUMN reservation_token CHAR(36) NULL,
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    ADD COLUMN expires_at DATETIME NULL,
    ADD COLUMN discount_id INT NULL,
    ADD UNIQUE KEY uq_pending_checkouts_reservation_token (reservation_token),
    ADD INDEX pending_checkouts_status_expiry_idx (status, expires_at);

UPDATE pending_checkouts
SET reservation_token = UUID()
WHERE reservation_token IS NULL;

ALTER TABLE pending_checkouts
    MODIFY reservation_token CHAR(36) NOT NULL;

CREATE TABLE inventory_reservations (
    id INT NOT NULL AUTO_INCREMENT,
    pending_checkout_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_inventory_reservation_checkout_product (pending_checkout_id, product_id),
    INDEX inventory_reservations_product_idx (product_id),
    CONSTRAINT fk_inventory_reservations_checkout
        FOREIGN KEY (pending_checkout_id) REFERENCES pending_checkouts(id),
    CONSTRAINT fk_inventory_reservations_product
        FOREIGN KEY (product_id) REFERENCES products(id)
);
```

Add matching Prisma models/relations.

- [ ] **Step 4: Implement `reserveInventory` in one transaction**

Algorithm:

```ts
return withTransaction(async (tx) => {
    const productIds = aggregatedItems.map((item) => item.productId).sort((a, b) => a - b);

    const products = await tx.query<LockedProduct[]>(
        `SELECT id, name, stock
         FROM products
         WHERE id IN (${placeholders(productIds)}) AND stock >= 0
         ORDER BY id
         FOR UPDATE`,
        productIds,
    );

    const active = await tx.query<ReservedQuantityRow[]>(
        `SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
         FROM inventory_reservations ir
         JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
         WHERE ir.product_id IN (${placeholders(productIds)})
           AND pc.status = 'PENDING'
           AND pc.expires_at > UTC_TIMESTAMP()
         GROUP BY ir.product_id`,
        productIds,
    );

    // assert stock - reserved >= requested for each item
    // insert pending_checkout + inventory_reservations
});
```

Always lock product IDs in ascending order to minimize deadlock risk.

- [ ] **Step 5: Make cart/checkout availability reservation-aware**

Where checkout validation currently compares requested quantity with `products.stock`, use `available_stock` that subtracts active reservations. The API should expose both `stock` (physical/admin stock) and `available_stock` (sellable storefront stock). In `client/src/types/product.ts`, add `available_stock: number`; in `client/src/utils/product.ts`, normalize it with `source.available_stock ?? source.stock`. Storefront/cart components must use `available_stock` for purchase limits and stock badges, while admin inventory screens continue to use physical `stock`.

Do not change physical `products.stock` during reservation creation/release.

- [ ] **Step 6: Make product list/detail expose available stock without N+1 queries**

Extend product queries with a grouped reservation join:

```sql
LEFT JOIN (
    SELECT ir.product_id, SUM(ir.quantity) AS reserved_quantity
    FROM inventory_reservations ir
    JOIN pending_checkouts pc ON pc.id = ir.pending_checkout_id
    WHERE pc.status = 'PENDING' AND pc.expires_at > UTC_TIMESTAMP()
    GROUP BY ir.product_id
) active_reservations ON active_reservations.product_id = products.id
```

Select:

```sql
GREATEST(products.stock - COALESCE(active_reservations.reserved_quantity, 0), 0) AS available_stock
```

- [ ] **Step 7: Run reservation/order/catalog tests**

```bash
pnpm --filter server test -- --run \
  src/orders/__tests__/checkout-reservation.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts
pnpm --filter server typecheck
```

- [ ] **Step 8: Commit reservation infrastructure**

```bash
git add server/src/database/prisma server/src/orders server/src/cart server/src/products
git commit -m "feat(inventory): reserve stock for pending checkout"
```

---

## Task 5: Make Stripe checkout consume reservations atomically and remove paid oversell

**Files:**
- Modify: `server/src/orders/orders.stripe.service.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.repository.ts`
- Modify: `server/src/stripe/stripeWebhook.controller.ts`
- Modify: `server/src/stripe/stripe.service.ts`
- Modify: `server/src/inventory/inventory.repository.ts`
- Modify: `server/src/inventory/inventory.service.ts`
- Test: `server/src/orders/__tests__/orders.stripe.service.test.ts`
- Test: `server/src/orders/__tests__/orders.integration.test.ts`
- Test: `server/src/stripe/__tests__/stripeWebhook.controller.test.ts`
- Test: `server/src/stripe/stripe-webhook-flow.spec.ts`

**Interfaces:**
- Changes `createOrderFromValidatedCart` so it has no `allowOversell` option.
- Produces `finalizeReservedCheckout(stripeSessionId, paymentIntentId): Promise<Order>`.
- Produces `handleCheckoutSessionExpired(session): Promise<void>`.

- [ ] **Step 1: Replace oversell tests with reservation invariants**

Delete expectations asserting `allowOversell: true`. Add tests asserting the Stripe service calls `reserveInventory` before returning a URL and finalization uses the reservation token/session.

```ts
expect(ordersService.createOrderFromValidatedCart).not.toHaveBeenCalledWith(
    expect.objectContaining({ allowOversell: true }),
);
```

Add webhook test:

```ts
stripeService.constructWebhookEvent.mockReturnValue({
    type: "checkout.session.expired",
    data: { object: { id: "cs_expired_1" } },
});
expect(ordersStripeService.handleCheckoutSessionExpired).toHaveBeenCalledWith(
    expect.objectContaining({ id: "cs_expired_1" }),
);
```

- [ ] **Step 2: Run Stripe-focused tests and confirm red**

```bash
pnpm --filter server test -- --run \
  src/orders/__tests__/orders.stripe.service.test.ts \
  src/stripe/__tests__/stripeWebhook.controller.test.ts \
  src/stripe/stripe-webhook-flow.spec.ts
```

- [ ] **Step 3: Reserve before creating Stripe Checkout Session**

Flow:

```ts
const reservation = await this.checkoutReservationService.reserveInventory({
    uid,
    authoritativeCart,
    authoritativeTotalPrice,
    discount: authoritativeDiscount,
    shippingAddress,
    databaseExpiresAt: new Date(Date.now() + 35 * 60_000),
});

try {
    const session = await this.stripeService.createCheckoutSession({
        ...stripePayload,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        client_reference_id: reservation.reservationToken,
        metadata: {
            uid,
            reservationToken: reservation.reservationToken,
        },
    });
    await this.checkoutReservationService.attachStripeSession(
        reservation.reservationToken,
        session.id,
    );
    return { url: session.url! };
} catch (error) {
    await this.checkoutReservationService.releaseReservation(
        reservation.reservationToken,
        "stripe_session_creation_failed",
    );
    throw error;
}
```

Stripe allows Checkout Session custom expiration from 30 minutes to 24 hours; use exactly 30 minutes here.

- [ ] **Step 4: Finalize the paid checkout in one database transaction**

Inside `finalizeReservedCheckout`:

```sql
SELECT *
FROM pending_checkouts
WHERE stripe_session_id = ?
FOR UPDATE;
```

Then lock products in ascending ID order and verify reserved quantities. Insert order and items, then decrement stock with guarded updates:

```sql
UPDATE products
SET stock = stock - ?
WHERE id = ? AND stock >= ?;
```

If `affectedRows !== 1`, throw and rollback. With a valid active reservation this indicates corrupted state and must never be silently clamped with `GREATEST(..., 0)`.

- [ ] **Step 5: Insert inventory movement rows through the same transaction**

Add a transaction-aware repository method:

```ts
async createMovementsInTransaction(
    tx: TransactionContext,
    movements: InventoryMovementInput[],
): Promise<void>
```

Its SQL is the existing bulk insert, but executed through `tx.query` before commit.

Remove this paid/COD order path call after commit:

```ts
this.inventoryService.recordMovements(inventoryMovements);
```

- [ ] **Step 6: Preserve Stripe idempotency**

Maintain the unique database constraint on `orders.stripe_checkout_session_id`. For duplicate `checkout.session.completed`:

1. lock pending checkout;
2. if status is `CONSUMED`, query existing order by session;
3. return the existing order without stock changes.

- [ ] **Step 7: Handle `checkout.session.expired`**

Controller branch:

```ts
if (event.type === "checkout.session.completed") {
    await this.ordersStripeService.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
} else if (event.type === "checkout.session.expired") {
    await this.ordersStripeService.handleCheckoutSessionExpired(event.data.object as Stripe.Checkout.Session);
}
```

Expiration marks `pending_checkouts.status = 'EXPIRED'`; reservation rows remain as historical records and are excluded from availability.

- [ ] **Step 8: Remove `allowOversell` completely**

Search must return no production references:

```bash
git grep -n "allowOversell" -- server/src
```

Expected: no matches outside historical docs. Do not keep the flag as a compatibility option.

- [ ] **Step 9: Run all order/payment/inventory tests**

```bash
pnpm --filter server test -- --run \
  src/orders/__tests__/orders.stripe.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts \
  src/stripe/__tests__/stripeWebhook.controller.test.ts \
  src/stripe/stripe-webhook-flow.spec.ts
pnpm --filter server test -- --run
pnpm --filter server typecheck
```

- [ ] **Step 10: Commit paid-checkout correctness**

```bash
git add server/src/orders server/src/stripe server/src/inventory
git commit -m "fix(checkout): finalize Stripe orders from stock reservations"
```

---

# Phase P1 — Domain Integrity and Auditability

## Task 6: Enforce promotion `usageLimit` with transactional redemptions

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906100000_promotion_redemptions/migration.sql`
- Modify: `server/src/promotions/promotions.repository.ts`
- Modify: `server/src/promotions/promotions.service.ts`
- Modify: `server/src/orders/checkout-reservation.service.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.stripe.service.ts`
- Create: `server/src/promotions/__tests__/promotions.service.test.ts`
- Test: `server/src/orders/__tests__/checkout-reservation.service.test.ts`
- Test: `server/src/orders/__tests__/orders.integration.test.ts`

**Interfaces:**
- Produces: `reservePromotion(tx, discountCode, pendingCheckoutId, userId, expiresAt)`.
- Produces: `consumePromotionReservation(tx, pendingCheckoutId, orderId)`.
- Produces: `releasePromotionReservation(pendingCheckoutId)`.

- [ ] **Step 1: Write failing quota concurrency tests**

Given `usageLimit = 1`, two Stripe checkout reservations using the same code should produce one reserved redemption and one `409`.

Also verify expired/released redemption does not consume quota, while consumed redemption does.

- [ ] **Step 2: Run promotion/reservation tests and confirm red**

```bash
pnpm --filter server test -- --run \
  src/promotions/__tests__/promotions.service.test.ts \
  src/orders/__tests__/checkout-reservation.service.test.ts
```

- [ ] **Step 3: Add redemption table**

```sql
CREATE TABLE discount_redemptions (
    id INT NOT NULL AUTO_INCREMENT,
    discount_id INT NOT NULL,
    pending_checkout_id INT NULL,
    order_id INT NULL,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL,
    expires_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    consumed_at DATETIME NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_discount_redemptions_pending_checkout (pending_checkout_id),
    UNIQUE KEY uq_discount_redemptions_order (order_id),
    INDEX discount_redemptions_quota_idx (discount_id, status, expires_at),
    CONSTRAINT fk_discount_redemptions_discount FOREIGN KEY (discount_id) REFERENCES discounts(id),
    CONSTRAINT fk_discount_redemptions_checkout FOREIGN KEY (pending_checkout_id) REFERENCES pending_checkouts(id),
    CONSTRAINT fk_discount_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id)
);
```

Add matching Prisma model and relations.

- [ ] **Step 4: Lock the discount row when reserving quota**

```sql
SELECT id, discount_code, discount_percent, active, min_order_value,
       starts_at, expires_at, usage_limit
FROM discounts
WHERE discount_code = ?
FOR UPDATE;
```

Then count quota holders:

```sql
SELECT COUNT(*) AS used
FROM discount_redemptions
WHERE discount_id = ?
  AND (
      status = 'CONSUMED'
      OR (status = 'RESERVED' AND expires_at > UTC_TIMESTAMP())
  );
```

Reject when `usage_limit IS NOT NULL AND used >= usage_limit`.

- [ ] **Step 5: Reserve Stripe promotion usage in the same checkout reservation transaction**

Pass `discountCode` into `CheckoutReservationService`. Validate eligibility, compute the authoritative discount, write `pending_checkouts.discount_id`, then insert a `RESERVED` redemption tied to that checkout.

Do not trust the client-submitted discount amount.

- [ ] **Step 6: Consume/release redemption atomically**

On successful order finalization:

```sql
UPDATE discount_redemptions
SET status = 'CONSUMED', order_id = ?, consumed_at = UTC_TIMESTAMP()
WHERE pending_checkout_id = ? AND status = 'RESERVED';
```

On `checkout.session.expired`:

```sql
UPDATE discount_redemptions
SET status = 'RELEASED'
WHERE pending_checkout_id = ? AND status = 'RESERVED';
```

COD order creation should lock the discount and insert a `CONSUMED` redemption directly inside the order transaction.

- [ ] **Step 7: Run promotion + checkout regressions**

```bash
pnpm --filter server test -- --run \
  src/promotions/__tests__/promotions.service.test.ts \
  src/orders/__tests__/checkout-reservation.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts
pnpm --filter server typecheck
```

- [ ] **Step 8: Commit promotion quota correctness**

```bash
git add server/src/database/prisma server/src/promotions server/src/orders
git commit -m "feat(promotions): enforce redemption quotas transactionally"
```

---

## Task 7: Add SKU/MPN/warranty and immutable order-item snapshots

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906110000_product_sku_order_snapshots/migration.sql`
- Modify: `server/src/products/products.validator.ts`
- Modify: `server/src/products/products.dto.ts`
- Modify: `server/src/products/products.types.ts`
- Modify: `server/src/products/products.service.ts`
- Modify: `server/src/products/products.repository.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.repository.ts`
- Modify: `server/src/orders/orders.types.ts`
- Modify: `client/src/types/product.ts`
- Modify: `client/src/features/admin/api.ts`
- Modify: `client/src/features/admin/pages/AdminProductPage.tsx`
- Modify: `client/src/features/admin/pages/AdminAddProductPage.tsx`
- Modify: `server/src/docs/openapi.json`
- Create: `server/src/products/__tests__/products.service.test.ts`
- Test: `server/src/orders/__tests__/orders.integration.test.ts`

**Interfaces:**
- `Product` gains `sku`, `manufacturerPartNumber`, `warrantyMonths`.
- `OrderItem` gains immutable snapshot fields; order detail reads snapshot first.
- Existing rows receive deterministic backfill SKUs. New-product creation accepts an optional admin-supplied SKU; if omitted, the server generates a unique `DIG-<uuid-fragment>` SKU so the current admin create flow remains backward compatible.

- [ ] **Step 1: Write failing snapshot regression test**

Create an order for `Product A`, then update the product name/price/image. Fetch the order again and assert the order still returns the original snapshot values.

```ts
expect(order.items[0]).toMatchObject({
    productName: "Original GPU Name",
    sku: "GPU-000001",
    unitPrice: 499.99,
});
```

- [ ] **Step 2: Run product/order tests and confirm red**

```bash
pnpm --filter server test -- --run \
  src/products/__tests__/products.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts
```

- [ ] **Step 3: Add product commerce identity fields**

Migration sequence:

```sql
ALTER TABLE products
    ADD COLUMN sku VARCHAR(64) NULL,
    ADD COLUMN manufacturer_part_number VARCHAR(128) NULL,
    ADD COLUMN warranty_months INT NULL;

UPDATE products
SET sku = CONCAT('DIG-', LPAD(id, 8, '0'))
WHERE sku IS NULL;

ALTER TABLE products
    MODIFY sku VARCHAR(64) NOT NULL,
    ADD UNIQUE KEY uq_products_sku (sku),
    ADD INDEX products_mpn_idx (manufacturer_part_number);
```

Validate `warranty_months >= 0` in Zod/service logic.

- [ ] **Step 4: Add snapshot columns to `order_items`**

```sql
ALTER TABLE order_items
    ADD COLUMN sku_snapshot VARCHAR(64) NULL,
    ADD COLUMN product_name_snapshot VARCHAR(255) NULL,
    ADD COLUMN image_snapshot VARCHAR(255) NULL,
    ADD COLUMN unit_price_snapshot DECIMAL(11,2) NULL,
    ADD COLUMN brand_snapshot VARCHAR(255) NULL,
    ADD COLUMN category_snapshot VARCHAR(255) NULL,
    ADD COLUMN warranty_months_snapshot INT NULL,
    ADD COLUMN specifications_snapshot JSON NULL;
```

Do not make snapshot columns non-null yet; old orders must remain readable.

- [ ] **Step 5: Build snapshots from the authoritative cart/product rows**

Define a narrow type:

```ts
export type OrderItemSnapshot = {
    productId: number;
    sku: string;
    productName: string;
    image: string | null;
    unitPrice: number;
    brand: string;
    category: string;
    warrantyMonths: number | null;
    specifications: Record<string, string | number>;
    quantity: number;
};
```

Insert snapshot values with order items inside the existing transaction.

- [ ] **Step 6: Read snapshots before current catalog values**

Order detail SQL should use:

```sql
COALESCE(oi.product_name_snapshot, p.name) AS product_name,
COALESCE(oi.unit_price_snapshot, p.sale_price, p.price) AS price,
COALESCE(oi.image_snapshot, p.main_image) AS main_image,
COALESCE(oi.brand_snapshot, b.name) AS brand,
COALESCE(oi.category_snapshot, c.name) AS category
```

Expose snapshot SKU and warranty in response types.

- [ ] **Step 7: Expose commerce identity in the admin editor and OpenAPI**

Extend `Product` client typing plus `client/src/features/admin/api.ts`. Add editable `sku`, `manufacturerPartNumber`, and `warrantyMonths` fields to `AdminProductPage.tsx`; add optional inputs for the same fields to `AdminAddProductPage.tsx`. `addProduct(FormData)` should append these fields when provided. SKU is required when editing an existing product; create remains backward compatible because the backend auto-generates one when omitted.

Update `server/src/docs/openapi.json` product schemas/request bodies with the three fields and document `available_stock` separately from physical `stock`.

- [ ] **Step 8: Run snapshot regressions and full server suite**

```bash
pnpm --filter server test -- --run \
  src/products/__tests__/products.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts
pnpm --filter server test -- --run
pnpm --filter server typecheck
```

- [ ] **Step 9: Commit product identity/order history**

```bash
git add server/src/database/prisma server/src/products server/src/orders server/src/docs/openapi.json \
  client/src/types/product.ts client/src/features/admin
git commit -m "feat(catalog): snapshot SKU and product data in orders"
```

---

## Task 8: Add typed structured product attributes for electronics filters

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906120000_product_attributes/migration.sql`
- Create: `server/src/products/product-attributes.types.ts`
- Create: `server/src/products/product-attributes.repository.ts`
- Modify: `server/src/products/products.validator.ts`
- Modify: `server/src/products/products.dto.ts`
- Modify: `server/src/products/products.repository.ts`
- Modify: `server/src/products/products.service.ts`
- Modify: `client/src/features/products/api.ts`
- Modify: `client/src/features/admin/api.ts`
- Modify: `client/src/features/admin/pages/AdminProductPage.tsx`
- Modify: `client/src/features/admin/pages/AdminAddProductPage.tsx`
- Create: `server/src/products/__tests__/products.service.test.ts`

**Interfaces:**
- New product input accepts `attributes: ProductAttributeInput[]`.
- Attribute keys are normalized lowercase snake-case identifiers such as `socket`, `vram_gb`, `wattage`, `memory_type`.
- At most one attribute value exists per `(productId, key)`.
- Legacy `specifications` remains a fallback display field.

- [ ] **Step 1: Write failing typed-attribute tests**

```ts
const input = productCreateSchema.parse({
    name: "Example GPU",
    category: "GPU",
    brand: "Example",
    price: 500,
    inventory: 5,
    sku: "GPU-EX-001",
    attributes: [
        { key: "vram_gb", label: "VRAM", type: "number", numberValue: 12, unit: "GB", filterable: true },
        { key: "memory_type", label: "Memory Type", type: "text", textValue: "GDDR7", filterable: true },
    ],
});
expect(input.attributes).toHaveLength(2);
```

Reject duplicate keys and a number attribute without `numberValue`.

- [ ] **Step 2: Run product tests and confirm red**

```bash
pnpm --filter server test -- --run src/products/__tests__/products.service.test.ts
```

- [ ] **Step 3: Create normalized attribute table**

```sql
CREATE TABLE product_attributes (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    attribute_key VARCHAR(80) NOT NULL,
    label VARCHAR(120) NOT NULL,
    value_type VARCHAR(16) NOT NULL,
    text_value VARCHAR(255) NULL,
    number_value DECIMAL(18,4) NULL,
    unit VARCHAR(32) NULL,
    filterable TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    UNIQUE KEY uq_product_attributes_product_key (product_id, attribute_key),
    INDEX product_attributes_text_filter_idx (attribute_key, text_value),
    INDEX product_attributes_number_filter_idx (attribute_key, number_value),
    CONSTRAINT fk_product_attributes_product FOREIGN KEY (product_id) REFERENCES products(id)
);
```

Add the Prisma model.

- [ ] **Step 4: Define a discriminated Zod union**

```ts
const textAttributeSchema = z.object({
    key: attributeKeySchema,
    label: requiredText("Attribute label"),
    type: z.literal("text"),
    textValue: requiredText("Attribute value"),
    unit: z.string().trim().max(32).optional(),
    filterable: z.boolean().optional().default(true),
});

const numberAttributeSchema = z.object({
    key: attributeKeySchema,
    label: requiredText("Attribute label"),
    type: z.literal("number"),
    numberValue: z.coerce.number().finite(),
    unit: z.string().trim().max(32).optional(),
    filterable: z.boolean().optional().default(true),
});
```

Validate uniqueness of keys with `.superRefine(...)`.

- [ ] **Step 5: Persist product + attributes atomically**

Product create/update must run product row and attribute upserts/deletes in one transaction. For an update, the submitted attribute set replaces the current structured set for that product.

Use parameterized SQL only.

- [ ] **Step 6: Add specification filters without a search-engine dependency**

Extend product filtering with a typed API shape such as:

```ts
type AttributeFilter =
    | { key: string; textValues: string[] }
    | { key: string; min: number; max?: number };
```

Use `EXISTS` subqueries for each selected attribute filter, so filtering does not multiply product rows:

```sql
AND EXISTS (
    SELECT 1
    FROM product_attributes pa
    WHERE pa.product_id = products.id
      AND pa.attribute_key = ?
      AND pa.number_value >= ?
)
```

Do not add Elasticsearch/Meilisearch in this task.

- [ ] **Step 7: Add a maintainable admin attribute editor**

In both admin product create/edit pages, represent attributes as rows with `key`, `label`, `type`, `value`, `unit`, and `filterable`. Convert the UI rows to the typed API shape before submitting. Do not hard-code CPU/GPU-only columns into the product table; category-specific presets may prefill common rows but persistence remains generic.

Add client tests or helper tests for converting number/text rows into `ProductAttributeInput[]` and rejecting duplicate keys before submission.

- [ ] **Step 8: Include structured attributes in order snapshots**

When building `specifications_snapshot`, serialize current `product_attributes` into a JSON object keyed by `attribute_key`. Existing `specifications` text is not authoritative for new orders once structured attributes exist.

- [ ] **Step 9: Run product/order regressions**

```bash
pnpm --filter server test -- --run src/products/__tests__/products.service.test.ts
pnpm --filter server test -- --run src/orders/__tests__/orders.integration.test.ts
pnpm --filter server typecheck
```

- [ ] **Step 10: Commit structured electronics specifications**

```bash
git add server/src/database/prisma server/src/products server/src/orders client/src/features/products \
  client/src/features/admin
git commit -m "feat(catalog): add typed electronics specifications"
```

---

## Task 9: Make inventory ledger and order timeline transactionally durable; remove runtime DDL

**Files:**
- Modify: `server/src/database/prisma/schema.prisma`
- Create: `server/src/database/prisma/migrations/20260906130000_audit_schema_ownership/migration.sql`
- Modify: `server/src/inventory/inventory.repository.ts`
- Modify: `server/src/inventory/inventory.service.ts`
- Modify: `server/src/products/products.service.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/orders.timeline.service.ts`
- Modify: `server/src/orders/orders.timeline.repository.ts`
- Modify: `server/src/promotions/promotions.repository.ts`
- Test: `server/src/inventory/__tests__/inventory.service.test.ts`
- Test: `server/src/orders/__tests__/orders.integration.test.ts`
- Create: `server/src/promotions/__tests__/promotions.service.test.ts`

**Interfaces:**
- Critical stock-changing methods accept/use `TransactionContext` and write inventory history before commit.
- Timeline writes for order creation/status changes occur in the same transaction as the corresponding order mutation.
- Runtime repositories contain no schema creation/discovery code.

- [ ] **Step 1: Add failing rollback tests**

Simulate inventory movement insert failure during order creation. Expected behavior: order and stock update both roll back.

Simulate timeline insert failure during order status update. Expected: status update rolls back.

- [ ] **Step 2: Run targeted tests and confirm red**

```bash
pnpm --filter server test -- --run \
  src/inventory/__tests__/inventory.service.test.ts \
  src/orders/__tests__/orders.integration.test.ts
```

- [ ] **Step 3: Put `inventory_movements` under Prisma migration ownership**

Migration contains the currently runtime-created table definition:

```sql
CREATE TABLE IF NOT EXISTS inventory_movements (
    id INT NOT NULL AUTO_INCREMENT,
    product_id INT NOT NULL,
    order_id INT NULL,
    movement_type VARCHAR(40) NOT NULL,
    quantity_change INT NOT NULL,
    stock_before INT NULL,
    stock_after INT NULL,
    note VARCHAR(255) NULL,
    actor_id VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX inventory_movements_product_id_idx (product_id),
    INDEX inventory_movements_created_at_idx (created_at)
);
```

Add matching Prisma model. Do not add runtime `CREATE TABLE` fallback.

In the same migration, take ownership of the current runtime-created order timeline table:

```sql
CREATE TABLE IF NOT EXISTS order_status_events (
    id INT NOT NULL AUTO_INCREMENT,
    order_id INT NOT NULL,
    status INT NOT NULL,
    label VARCHAR(80) NOT NULL,
    note VARCHAR(255) NULL,
    actor_id VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX order_status_events_order_id_idx (order_id),
    INDEX order_status_events_created_at_idx (created_at)
);
```

Represent `order_status_events` in `schema.prisma` as `OrderStatusEvent` mapped to the existing table.

- [ ] **Step 4: Delete runtime inventory/timeline schema mutation**

Remove from `InventoryRepository`:

```ts
private tableReady = false;
private ensureInventoryMovementTable(...)
```

Remove the equivalent `tableReady` / `ensureOrderTimelineTable(...)` runtime DDL path from `OrderTimelineRepository`. Repository methods should directly query their migration-owned tables.

- [ ] **Step 5: Delete promotion runtime schema mutation/discovery**

Remove `createDiscountsTableSql`, `ensureDiscountsTable`, `SHOW COLUMNS`, `promotionColumns`, and optional-column branching from `PromotionsRepository`.

Replace with explicit SQL against the schema already represented by Prisma:

```sql
SELECT id, discount_code, discount_percent, active, min_order_value,
       starts_at, expires_at, usage_limit
FROM discounts
...
```

A missing migration is a deployment error, not an application runtime compatibility mode.

- [ ] **Step 6: Make product stock adjustments atomic with inventory movements**

For product creation/manual restock:

```ts
await withTransaction(async (tx) => {
    const product = await insertOrUpdateProduct(tx, ...);
    await inventoryRepository.createMovementInTransaction(tx, movement);
    return product;
});
```

Do not commit the stock change first and log later.

- [ ] **Step 7: Make order timeline part of order transaction**

Add:

```ts
createTimelineEventInTransaction(
    tx: TransactionContext,
    input: OrderTimelineInput,
): Promise<void>
```

Call it before commit for initial order placement and status transitions.

Notifications remain post-commit because delivery failure must not rollback business state.

- [ ] **Step 8: Verify no runtime DDL remains in feature repositories**

```bash
git grep -nE "CREATE TABLE|ALTER TABLE|SHOW COLUMNS" -- server/src ':!server/src/database'
```

Expected: no repository/service matches.

- [ ] **Step 9: Run schema + regression checks**

```bash
pnpm --filter server prisma:validate
pnpm --filter server prisma:format
pnpm --filter server test -- --run
pnpm --filter server typecheck
pnpm --filter server lint
```

- [ ] **Step 10: Commit transactional audit/schema ownership**

```bash
git add server/src/database/prisma server/src/inventory server/src/products \
  server/src/orders server/src/promotions
git commit -m "refactor(db): make audit writes transactional and migration-owned"
```

---

# Phase P2 — Deployment Hardening and Regression Coverage

## Task 10: Add Redis-backed distributed rate limiting for sensitive routes

**Files:**
- Modify: `server/.env.example`
- Modify: `server/src/config/env.config.ts`
- Create: `server/src/shared/rate-limit/redis-rate-limit.ts`
- Modify: `server/src/middleware/rate-limit.middleware.ts`
- Create: `server/src/middleware/__tests__/rate-limit.middleware.test.ts`

**Interfaces:**
- Adds `REDIS_URL`.
- Produces `RedisFixedWindowLimiter.consume(key, limit, windowMs)`.
- Existing `createRateLimitMiddleware(productionLimit)` remains the route-facing API.

- [ ] **Step 1: Write failing limiter tests**

Test:
- first request allowed;
- request over limit rejected with 429;
- key expires after window;
- production with configured Redis uses Redis path;
- development without Redis uses existing in-memory limiter.

- [ ] **Step 2: Run rate-limit tests and confirm red**

```bash
pnpm --filter server test -- --run src/middleware/__tests__/rate-limit.middleware.test.ts
```

- [ ] **Step 3: Add Redis config using existing `ioredis`**

`env.config.ts`:

```ts
redisUrl: process.env.REDIS_URL || "",
```

`.env.example`:

```dotenv
REDIS_URL=
```

- [ ] **Step 4: Implement atomic fixed-window consumption**

Use one Lua script so increment and initial expiry are atomic:

```lua
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { current, ttl }
```

TypeScript result:

```ts
export type RateLimitResult = {
    totalHits: number;
    resetMs: number;
    allowed: boolean;
};
```

Key format:

```text
digital-e:rl:<route-group>:<ip-or-user-id>
```

- [ ] **Step 5: Preserve local/test behavior**

If `NODE_ENV !== "production"` or `REDIS_URL` is empty, keep `express-rate-limit` memory behavior. Production auth/payment routes must use Redis when configured.

- [ ] **Step 6: Run tests/typecheck**

```bash
pnpm --filter server test -- --run src/middleware/__tests__/rate-limit.middleware.test.ts
pnpm --filter server typecheck
pnpm --filter server lint
```

- [ ] **Step 7: Commit distributed rate limiting**

```bash
git add server/.env.example server/src/config server/src/shared/rate-limit server/src/middleware
git commit -m "feat(security): distribute sensitive route rate limits"
```

---

## Task 11: Add end-to-end checkout regression tests and strengthen CI gates

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml` only if the workspace script requires it
- Create: `playwright.config.ts`
- Create: `e2e/storefront.spec.ts`
- Create: `e2e/auth-boundary.spec.ts`
- Create: `e2e/checkout.spec.ts`
- Modify: `server/src/main.ts`
- Create: `server/test/e2e-server.ts`
- Create: `server/test/test-firebase-admin.service.ts`
- Create: `server/test/test-stripe.service.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `Wiki/architecture.md`
- Modify: `server/README.prisma.md`

**Interfaces:**
- Adds root script `test:e2e`.
- CI keeps existing unit/integration gates and adds Playwright only after server/client build + seeded test database.
- No production Firebase/Stripe secrets are required for deterministic CI tests: browser tests cover application flows with a test-only backend auth verifier and Stripe service override wired only under `NODE_ENV=test`.

- [ ] **Step 1: Add Playwright dependency and root script**

```bash
pnpm add -Dw @playwright/test
pnpm exec playwright install chromium
```

Root script:

```json
{
  "test:e2e": "playwright test"
}
```

- [ ] **Step 2: Extract reusable Nest HTTP configuration and create the E2E bootstrap**

Refactor `server/src/main.ts` so the production bootstrap and tests share one function that configures cookies, CORS, request IDs, docs/routes, global prefix, and `app.init()` without changing production behavior:

```ts
export async function configureHttpApp(app: INestApplication) {
    // existing Express middleware + /api/openapi.json + Scalar + / + global prefix
    await app.init();
    return app;
}
```

Create `server/test/e2e-server.ts` with `@nestjs/testing`:

```ts
const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FirebaseAdminAuthService)
    .useClass(TestFirebaseAdminAuthService)
    .overrideProvider(StripeService)
    .useClass(TestStripeService)
    .compile();

const app = moduleRef.createNestApplication({ rawBody: true });
await configureHttpApp(app);
await app.listen(4000, "127.0.0.1");
```

`TestFirebaseAdminAuthService` accepts deterministic tokens only inside this test file boundary, e.g. `test-firebase:<uid>`, and returns fixture `{ uid, email }`. `TestStripeService` returns deterministic `cs_test_*` sessions and records expire calls. Neither parser/adapter is imported by production modules.

- [ ] **Step 3: Configure Playwright to run the E2E bootstrap and Vite**

`playwright.config.ts` should use Chromium, one worker in CI, and trace on first retry:

```ts
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: process.env.CI ? 1 : undefined,
    use: {
        baseURL: "http://127.0.0.1:5173",
        trace: "on-first-retry",
    },
    webServer: [
        {
            command: "pnpm --filter server exec tsx ./test/e2e-server.ts",
            url: "http://127.0.0.1:4000/api/health",
            env: { ...process.env, NODE_ENV: "test" },
            reuseExistingServer: !process.env.CI,
        },
        {
            command: "pnpm --filter client dev -- --host 127.0.0.1",
            url: "http://127.0.0.1:5173",
            reuseExistingServer: !process.env.CI,
        },
    ],
});
```

This preserves `AuthGuard`/`RolesGuard`; only external Firebase/Stripe boundaries are substituted by dependency injection.

- [ ] **Step 4: Add auth-boundary E2E**

Test that the login/signup UI contains no role selector and that an API request attempting to send `role: "Admin"` returns 400.

```ts
await expect(page.getByText("Login as")).toHaveCount(0);
await expect(page.getByText("Signup as")).toHaveCount(0);
```

- [ ] **Step 5: Add COD checkout E2E**

Seed one customer + product, authenticate through the test verifier, add product to cart, submit COD order, then assert order appears in order history and available stock decreases exactly once.

- [ ] **Step 6: Add Stripe reservation E2E at service boundary**

Use a test Stripe adapter that returns deterministic `cs_test_*` sessions while still calling real Digital-E reservation/order code. Assert:

1. opening checkout reserves the last unit;
2. another user cannot reserve it;
3. `checkout.session.expired` releases availability;
4. `checkout.session.completed` creates exactly one order under duplicate webhook delivery.

- [ ] **Step 7: Add CI E2E job after server/client jobs**

The job should:

```yaml
needs: [client, server]
runs-on: ubuntu-24.04
```

Reuse MySQL 8.4 service setup, load the legacy baseline, run Prisma migrations, seed deterministic E2E fixtures, install Chromium, then:

```bash
pnpm test:e2e
```

Upload Playwright traces only on failure.

- [ ] **Step 8: Update architecture/migration documentation**

`Wiki/architecture.md` must document:
- Firebase server verification;
- rotating session model;
- checkout reservation lifecycle;
- transactional order/inventory boundary;
- Product-as-SKU + structured attributes;
- immutable order snapshots.

`server/README.prisma.md` must state that all **new** schema changes are forward Prisma migrations and repositories never self-create tables. Update root `README.md` with the production-hardening architecture summary and required Firebase/Redis environment variables.

- [ ] **Step 9: Run the complete local verification matrix**

```bash
pnpm install --frozen-lockfile
pnpm --filter client exec tsc --noEmit
pnpm --filter client lint
pnpm --filter client test -- --run
pnpm --filter client build
pnpm --filter server prisma:validate
pnpm --filter server typecheck
pnpm --filter server lint
pnpm --filter server test -- --run
pnpm --filter server test:integration
pnpm --filter server build
pnpm test:e2e
```

Expected: every command exits 0.

- [ ] **Step 10: Commit CI/E2E/documentation**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e server/src/main.ts server/test \
  .github/workflows/ci.yml README.md Wiki/architecture.md server/README.prisma.md
git commit -m "test(e2e): cover secure auth and checkout consistency"
```

---

# Execution Order and Gates

Run the tasks in this exact dependency order:

```text
Task 1  Firebase server identity
   |
Task 2  Rotating sessions
   |
Task 3  Transaction adapter
   |
Task 4  Inventory reservations
   |
Task 5  Stripe reservation finalization
   |
Task 6  Promotion redemption quota
   |
Task 7  SKU + immutable order snapshots
   |
Task 8  Structured specifications
   |
Task 9  Transactional audit + runtime DDL removal
   |
Task 10 Distributed rate limiting
   |
Task 11 E2E + CI + docs
```

### Gate A — Security-safe deployment

Tasks **1–2** must be complete before exposing admin/customer data to untrusted users.

Exit criteria:
- forged `uid/role` cannot authenticate;
- public signup cannot create Admin;
- access tokens are 15 minutes;
- refresh token replay fails;
- suspended/revoked sessions fail guards.

### Gate B — Money/stock-safe deployment

Tasks **3–6** must be complete before relying on Stripe payment for scarce inventory or limited-use promotions.

Exit criteria:
- two buyers cannot reserve the last unit;
- duplicate Stripe completion creates one order and one stock deduction;
- expired session releases stock availability and promotion quota;
- `allowOversell` is absent from production source;
- inventory movement is in the same transaction as the stock deduction.

### Gate C — Electronics-domain integrity

Tasks **7–9** establish durable commerce history and structured catalog data.

Exit criteria:
- product edits cannot mutate historical order display;
- each sellable product has unique SKU;
- structured spec filters work without parsing prose;
- runtime application code executes no schema DDL;
- inventory/timeline audit failures roll back their business mutation.

### Gate D — Production operations

Tasks **10–11** finish distributed deployment hardening and high-value regressions.

Exit criteria:
- sensitive route limits are shared across instances when Redis is configured;
- full CI is green;
- Playwright covers auth boundary, COD checkout, reservation expiry, paid finalize idempotency;
- architecture/database docs match implementation.

---

# Test Matrix

| Risk | Required test | Failure prevented |
|---|---|---|
| Client forges Admin role | Auth validator/controller + E2E | Privilege escalation |
| Fake Firebase UID | Firebase verifier service test | Account impersonation |
| Refresh token replay | Auth session test | Stolen-token persistence |
| Session/JWT mismatch | AuthGuard test | Cross-session token reuse |
| Two users buy last unit | Reservation concurrency integration | Overselling |
| Stripe webhook duplicate | Stripe integration test | Duplicate order/stock deduction |
| Stripe session expires | Webhook + reservation test | Inventory held indefinitely |
| Inventory movement insert fails | Transaction rollback integration | Stock/audit divergence |
| Promotion limit concurrency | Redemption transaction test | Coupon quota overflow |
| Product edited after purchase | Order snapshot integration | Corrupted order history |
| Structured numeric filter | Product repository integration | Incorrect electronics filtering |
| Missing migration | CI fresh DB setup | Runtime schema drift |
| Multiple server instances | Redis limiter test | Rate-limit bypass |

---

# Migration / Rollout Strategy

## Database rollout sequence

1. Back up production MySQL before Task 2 migration and again before Tasks 4/6/7/8 migrations.
2. Apply migrations with:

```bash
pnpm --filter server prisma:migrate:deploy
pnpm --filter server prisma:migrate:status
```

3. Deploy backward-compatible backend changes before requiring new client request contracts where possible.
4. Deploy the updated client immediately after Task 1 backend because login/register request bodies change.
5. Verify health + login + catalog + COD order after every P0 migration.
6. Enable Stripe reservation flow only after reservation migration and webhook handlers are deployed together.
7. Keep nullable order snapshot fields until existing order rows are safely backfilled or confirmed acceptable as fallback reads.

## Rollback rules

- Roll back application code by deployment version; do not down-migrate destructive production schema changes automatically.
- Forward-fix schema issues with a new migration.
- If Stripe reservation deployment fails after schema migration, revert app code to the previous checkout version only while Stripe checkout is disabled; do not re-enable the known `allowOversell` paid path for production traffic.
- If Firebase Admin configuration is missing in production, fail authentication requests explicitly rather than falling back to trusting client UID/role.

---

# Performance Guardrails

- Reservation creation locks only the distinct product IDs in the cart and locks them in ascending ID order.
- Add/keep indexes for reservation lookup by `product_id`, checkout status/expiry, promotion quota, SKU, MPN, and structured attribute filters.
- Do not use one query per product to compute reserved stock; use grouped joins/subqueries.
- Keep current pagination for the existing catalog scale. Revisit cursor pagination/full-text search only when measured query latency or catalog size justifies it.
- Run the existing catalog k6 test after Tasks 4 and 8 because reservation joins and attribute filters change hot product queries:

```bash
pnpm --filter server perf:catalog
```

Compare p95 latency and database slow-query logs with the pre-change baseline.

---

# Definition of Done

The production-hardening program is complete only when all of the following are true:

- [ ] Firebase ID tokens are verified server-side for email/password login/signup.
- [ ] Client cannot choose or submit an authoritative role.
- [ ] Public registration creates only `Customer`.
- [ ] Access JWT is always 15 minutes and includes a server session ID.
- [ ] Refresh tokens are opaque, hashed at rest, rotated, revocable, and replay-resistant.
- [ ] Stripe checkout reserves inventory before the URL is returned.
- [ ] `checkout.session.expired` releases reservation availability.
- [ ] `checkout.session.completed` consumes exactly one reservation/order under retries.
- [ ] `allowOversell` is absent from production source.
- [ ] Order stock deduction and inventory movement rows commit atomically.
- [ ] Promotion usage limits are enforced with locked transactional redemption records.
- [ ] Every new product has unique SKU; optional MPN/warranty fields are supported.
- [ ] New orders persist immutable item snapshots.
- [ ] Structured electronics attributes are filterable without parsing the legacy specification string.
- [ ] Runtime repositories do not create/alter/discover schema for compatibility.
- [ ] Sensitive route rate limits can be shared across instances through Redis.
- [ ] Unit, integration, build, migration validation, and E2E checks are green in CI.
- [ ] Architecture and migration documentation reflect the final implementation.

---

# Recommended Superpowers Execution

For execution, start from an isolated worktree and run one fresh review gate per task.

```text
superpowers:using-git-worktrees
        |
        v
superpowers:subagent-driven-development
        |
        +--> Task 1 implementation -> review -> tests -> commit
        +--> Task 2 implementation -> review -> tests -> commit
        +--> ...
        +--> Task 11 implementation -> review -> full verification
        |
        v
superpowers:verification-before-completion
        |
        v
superpowers:requesting-code-review
```

Prefer **Subagent-Driven Development** for this plan because Auth, Checkout, Catalog, Promotions, and Deployment are distinct reviewable boundaries, while the task order still preserves their dependencies.
