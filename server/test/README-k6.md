# k6 Performance Tests

These tests are designed to be safe for the current database. All scripts only send `GET` requests.

## 1. Install k6

On Windows, use one of these:

```powershell
winget install k6 --source winget
```

or:

```powershell
choco install k6
```

Verify:

```powershell
k6 version
```

## 2. Local database with Docker

To avoid stressing the production Aiven Cloud database, run a local MySQL with Docker:

### 2a. Start Docker services

```powershell
pnpm docker:up
```

This starts:
- **MySQL 8.0** on `localhost:3307` (database: `defaultdb`, user: `root`, password: `digital_e_root`)

### 2b. Import the schema and base data

```powershell
pnpm docker:import
```

Imports the SQL dump from `src/database/migrations/` into the Docker MySQL container.

### 2c. Seed mock data (orders + reviews)

```powershell
pnpm docker:seed
```

Creates 50 mock orders and 50 mock reviews (configurable via env).

### 2d. One-command setup

```powershell
pnpm docker:setup
```

Runs `up` + `import` + `seed` in sequence.

### 2e. Stop and clean up

```powershell
pnpm docker:down
```

Stops containers. Add `-v` to also destroy volumes:

```powershell
docker compose down -v
```

## 3. Start the backend

### 3a. Against Docker (local) database

Point the server to the Docker MySQL by copying the Docker env file:

```powershell
copy .env.docker .env
pnpm serve:ts
```

### 3b. Against production database

```powershell
pnpm serve:ts
```

The default test expects the API at `http://localhost:4000`.

## 4. Test scripts

| Script | Command | Description |
|--------|---------|-------------|
| `performance-test.js` | `pnpm perf:readonly` | Public read-only: health, CSRF, catalog listing, product detail, reviews, search, facets |
| `k6-catalog-test.js` | `pnpm perf:catalog` | Heavy-load catalog test: all public endpoints (listing, detail, search, facets, recommendations, related products, reviews, CSRF, blob health) |
| `k6-admin-readonly.js` | `pnpm perf:admin-readonly` | Admin read-only: orders, order items, users, user profiles, analytics, inventory summary, inventory movements, promotions |
| `k6-customer-readonly.js` | `pnpm perf:customer-readonly` | Customer read-only: order history, addresses, notifications |
| `k6-auth-readonly.js` | `pnpm perf:auth-readonly` | Authenticated user read-only: profile, orders, cart, cart validation, wishlist, addresses, notifications |
| `k6-redis-benchmark.js` | `pnpm perf:redis-cold` / `pnpm perf:redis-warm` | Redis cache before/after: measures cold vs warm cache performance on product listing, detail, search, facets |

### 4a. Public read-only (light load)

```powershell
k6 run test/performance-test.js
```

For another API URL:

```powershell
$env:BASE_URL="http://localhost:4000"; k6 run test/performance-test.js
```

To focus on one product detail/review page:

```powershell
$env:PRODUCT_ID="1"; k6 run test/performance-test.js
```

### 4b. Catalog heavy-load test

Ramps to 30 VUs over 4 minutes. Tests all public catalog surface:

```powershell
k6 run test/k6-catalog-test.js
```

With custom target product:

```powershell
$env:PRODUCT_ID="1"; k6 run test/k6-catalog-test.js
```

### 4c. Admin read-only test

Requires an authenticated admin cookie from your browser:

```powershell
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-admin-readonly.js
```

### 4d. Customer read-only test

Reads customer order history, saved addresses, and notifications:

```powershell
$env:USER_ID="your-user-id"
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-customer-readonly.js
```

### 4e. Auth read-only test

Reads all authenticated user endpoints including profile, cart, wishlist, cart validation, orders, addresses, notifications. Requires a user session:

```powershell
$env:USER_ID="your-user-id"
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-auth-readonly.js
```

### 4f. Redis cache benchmark (before/after)

Compares cold-cache vs warm-cache performance on product endpoints. The caching middleware uses Redis (5-minute TTL, auto-invalidates on product writes).

**Prerequisites:** Redis must be running (Docker: `pnpm docker:up`), and `REDIS_URL=redis://localhost:6379` must be set in `.env`.

```powershell
# Step 1 — Cold-start benchmark (clears cache, measures DB-only performance)
pnpm perf:redis-cold

# Step 2 — Warm-cache benchmark (runs against populated cache)
pnpm perf:redis-warm
```

Compare the `redis_products_list`, `redis_product_detail`, `redis_search`, and `redis_facets` trends between the two runs — especially `p(95)` and `avg`.

The warm-cache run typically shows 5-30x improvement on listing/facet/search endpoints since the entire response is served from Redis without hitting MySQL.

## 5. Read the result

Important metrics:

- `http_req_duration`: total response time.
- `http_req_failed`: failed request rate.
- `checks`: pass rate for expected status/body checks.
- `p(95)`: 95% of requests were faster than this value.
- Custom trends: each test script records endpoint-specific duration trends for granular analysis.

Thresholds by script:

| Script | p(95) max | Fail rate max | Check rate min |
|--------|----------|---------------|----------------|
| `performance-test.js` | 1200ms | 5% | 95% |
| `k6-catalog-test.js` | 1200ms | 5% | 95% |
| `k6-admin-readonly.js` | 1500ms | 5% | 95% |
| `k6-customer-readonly.js` | 1500ms | 5% | 95% |
| `k6-auth-readonly.js` | 1500ms | 5% | 95% |
| `k6-redis-benchmark.js` | none | 5% | 95% |

## 6. Keep it database-safe

Do not include these routes in a real database performance test unless you use a test database:

- `POST /api/orders/purchase/:uid`
- `POST /api/reviews`
- `POST /api/cart`
- `POST /api/users/:id/addresses`
- `POST /api/users/:id/notifications/read-all`
- `PUT /api/products/:id`
- `DELETE /api/products`

Use a cloned test database if you want to measure checkout, reviews, cart writes, or admin updates.
