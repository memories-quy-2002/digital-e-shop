# k6 performance tests

The scripts under `server/test/` send read-only `GET` requests. Use them against the isolated local Docker database, a disposable CI database, or an explicitly approved non-production test deployment. Do not use production data for load testing.

All profiles share `k6-config.js`, which validates `BASE_URL`, applies a 10-second request timeout, and refuses remote targets unless `ALLOW_REMOTE_TEST_TARGET=true` is set. Keep remote runs limited to approved test deployments.

## Install k6

Install the k6 CLI for your operating system using the [official installation guide](https://grafana.com/docs/k6/latest/set-up/install-k6/), then verify it:

```text
k6 version
```

The k6 binary must be on `PATH`. If you use a portable binary, set `K6_BIN` to its full path in `server/.env.k6` instead.

## Configure the runner

From the repository root, create the local configuration file:

```text
pnpm --dir server perf:setup
```

This copies `server/.env.k6.example` to the ignored `server/.env.k6` file and leaves an existing file untouched. The shared Node launcher loads this file for every profile, so the same setup works in PowerShell, Command Prompt, Bash, macOS, Linux, and CI. Environment variables supplied by a shell or CI override values in the file.

The default target is `http://127.0.0.1:4000`. Make sure the API is running and its test database is seeded before starting a profile. See [Development](../../docs/DEVELOPMENT.md) for local API setup.

## Available profiles

| Script | Command | Coverage |
| --- | --- | --- |
| `k6-api-smoke.js` | `pnpm --dir server perf:smoke` | Low-load health, catalog list/search/facets, product detail, and same-category comparison |
| `performance-test.js` | `pnpm --dir server perf:readonly` | Health, CSRF, catalog listing, product detail, reviews, search, and facets |
| `k6-catalog-test.js` | `pnpm --dir server perf:catalog` | Public catalog listing, detail, search, facets, related products, reviews, CSRF, and optional recommendations |
| `k6-admin-readonly.js` | `pnpm --dir server perf:admin-readonly` | Admin orders, order items, users, profiles, analytics, inventory movements, and promotions |
| `k6-customer-readonly.js` | `pnpm --dir server perf:customer-readonly` | Customer orders, addresses, and notifications |
| `k6-auth-readonly.js` | `pnpm --dir server perf:auth-readonly` | Authenticated profile, orders, cart, validation, wishlist, addresses, and notifications |

Run the smoke profile from any supported shell:

```text
pnpm --dir server perf:smoke
```

It defaults to one virtual user for 20 seconds, checks that fewer than 1% of HTTP requests fail, requires p95 response time below 1.2 seconds, and requires at least 99% of assertions to pass. The seeded catalog needs two products in the same category to exercise comparison. Keep smoke settings within the bounded profile:

```dotenv
SMOKE_VUS=2
SMOKE_DURATION=30s
```

Put optional values in `server/.env.k6`:

```dotenv
BASE_URL=http://127.0.0.1:4000
PRODUCT_ID=1
# Windows: K6_BIN="C:/Tools/k6/k6.exe"
# macOS/Linux: K6_BIN=/usr/local/bin/k6
```

Admin tests require an admin `COOKIE`. Customer and authenticated-user tests require a customer `COOKIE` and `USER_ID`. Use a disposable test account and keep credentials in the ignored local file or your CI secret store:

```dotenv
USER_ID=your_test_user_id
COOKIE="session=...; accessToken=..."
```

Never put real cookies or tokens in tracked files. The catalog profile skips personalized recommendations unless `RECOMMENDATION_USER_ID` is set to a test account ID. It never guesses an account ID from product data.

Every profile refuses remote targets by default. Set `ALLOW_REMOTE_TEST_TARGET=true` only for an explicitly approved, non-production test deployment; do not point any profile at production.

## Read the result

Review these metrics:

- `checks`: expected status and response-body assertions
- `http_req_failed`: failed request rate
- `http_req_duration`: response-time distribution
- `p(95)`: the response-time value below which 95% of requests completed
- Endpoint-specific trends recorded by each script
- `endpoint`: a bounded route label that avoids putting per-user or per-product IDs into metric tags

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
