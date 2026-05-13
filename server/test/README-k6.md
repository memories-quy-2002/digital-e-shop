# k6 Performance Tests

These tests are designed to be safe for the current database. The default script only sends `GET` requests.

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

## 2. Start the backend

From `server/`:

```powershell
npm run dev
```

or:

```powershell
node src/app.js
```

The default test expects the API at `http://localhost:4000`.

## 3. Run the safe public read-only test

From `server/`:

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

## 4. Run the admin read-only test

This test reads admin endpoints and needs an authenticated admin cookie from your browser.

```powershell
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-admin-readonly.js
```

## 5. Read the result

Important metrics:

- `http_req_duration`: total response time.
- `http_req_failed`: failed request rate.
- `checks`: pass rate for expected status/body checks.
- `p(95)`: 95% of requests were faster than this value.

The current thresholds fail the test if:

- More than 5% of requests fail.
- 95% response time is slower than 1200ms for public APIs.
- Less than 95% of checks pass.

## 6. Keep it database-safe

Do not include these routes in a real database performance test unless you use a test database:

- `POST /api/orders/purchase/:uid`
- `POST /api/reviews`
- `POST /api/cart`
- `PUT /api/products/:id`
- `DELETE /api/products`

Use a cloned test database if you want to measure checkout, reviews, cart writes, or admin updates.
