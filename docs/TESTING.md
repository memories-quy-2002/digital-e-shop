# Testing Guide

## Recommended Local Checks

Frontend type check:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
```

Frontend production build:

```powershell
cd client
.\node_modules\.bin\vite.cmd build
```

Backend syntax checks for changed files:

```powershell
cd server
node --check src\app.js
node --check src\routes\userRoutes.js
node --check src\routes\productRoutes.js
```

Add more `node --check` commands for any service, model, controller, or route
you change.

## k6 Performance Tests

The current k6 tests are intended to avoid database mutations.

Public read-only test:

```powershell
cd server
k6 run test/performance-test.js
```

Admin read-only test:

```powershell
cd server
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-admin-readonly.js
```

Customer read-only test:

```powershell
cd server
$env:USER_ID="your-user-id"
$env:COOKIE="session=...; accessToken=..."
k6 run test/k6-customer-readonly.js
```

## Reading k6 Results

Focus on:

- `checks`: expected status and response body checks.
- `http_req_failed`: failed HTTP request rate.
- `http_req_duration`: response time distribution.
- `p(95)`: response time that 95% of requests were faster than.

A fast `p(95)` with many failed checks usually means the API is responding
quickly but with wrong status codes, missing data, auth failures, or route
errors.

## Database Safety

Do not run write-heavy performance tests against real or shared data. These
actions can mutate the database:

- Checkout and order creation.
- Cart writes.
- Review creation.
- Address creation or updates.
- Notification read/write actions.
- Product updates or deletes.
- Promotion creation or updates.

Use a cloned test database when measuring write workflows.
