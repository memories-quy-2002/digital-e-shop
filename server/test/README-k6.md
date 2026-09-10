# k6 performance tests

The scripts in this directory send read-only `GET` requests. Use them against the isolated local Docker database, a disposable CI database, or an explicitly approved test deployment. Do not use production data for write or high-volume testing.

## Install k6

On Windows, install k6 with one of these commands:

```powershell
winget install k6 --source winget
choco install k6
```

Verify the installation:

```powershell
k6 version
```

## Prepare the local API

From the repository root:

```powershell
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
pnpm --dir server docker:setup
pnpm --dir server dev
```

The local API uses `http://localhost:4000`. The Docker database uses MySQL at `127.0.0.1:3307`, database `digital_e_shop_local`, and the `digital_e_shop_local_mysql_data` volume.

## Available scripts

| Script | Command | Coverage |
| --- | --- | --- |
| `performance-test.js` | `pnpm --dir server perf:readonly` | Health, CSRF, catalog listing, product detail, reviews, search, and facets |
| `k6-catalog-test.js` | `pnpm --dir server perf:catalog` | Public catalog listing, detail, search, facets, recommendations, related products, reviews, CSRF, and Blob health |
| `k6-admin-readonly.js` | `pnpm --dir server perf:admin-readonly` | Admin orders, order items, users, profiles, analytics, inventory movements, and promotions |
| `k6-customer-readonly.js` | `pnpm --dir server perf:customer-readonly` | Customer orders, addresses, and notifications |
| `k6-auth-readonly.js` | `pnpm --dir server perf:auth-readonly` | Authenticated profile, orders, cart, validation, wishlist, addresses, and notifications |

Run a public test:

```powershell
pnpm --dir server perf:readonly
```

Override the target or product when the script supports it:

```powershell
$env:BASE_URL="http://localhost:4000"
$env:PRODUCT_ID="1"
pnpm --dir server perf:readonly
```

Admin, customer, and authenticated-user scenarios require a current cookie. Set `USER_ID` for scripts that read a user-scoped route:

```powershell
$env:COOKIE="session=...; accessToken=..."
$env:USER_ID="your_user_id"
pnpm --dir server perf:customer-readonly
```

## Read the result

Review these metrics:

- `checks`: expected status and response-body assertions
- `http_req_failed`: failed request rate
- `http_req_duration`: response-time distribution
- `p(95)`: the response-time value below which 95% of requests completed
- Endpoint-specific trends recorded by each script

A low response time with failed checks can indicate an authorization failure, wrong response shape, missing data, or a route error.

## Database safety

Do not include these operations in a real-data performance run:

- Checkout or order creation
- Cart writes
- Review creation
- Address creation or updates
- Notification mutations
- Product updates or deletion
- Promotion creation or updates
- Admin status or inventory updates

Use a cloned database for write-heavy performance work. Keep demo reset and migration commands outside a performance run.
