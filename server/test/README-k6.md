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
| `k6-api-load.js` | `pnpm --dir server perf:load` | Fixed-arrival public catalog workflow: list, search, detail, and facets; exports a JSON summary |
| `k6-vu-capacity.js` | `pnpm --dir server perf:capacity` | Concurrent catalog users ramp through 10, 25, 50, and 100 VUs; exports a JSON summary |
| `k6-api-stress.js` | `pnpm --dir server perf:stress` | Bounded arrival-rate stress stages from 10 to 80 catalog workflows/second; aborts when an SLO fails |
| `k6-api-soak.js` | `pnpm --dir server perf:soak` | Holds a bounded catalog arrival rate for 10-60 minutes; defaults to 20 workflows/second for 30 minutes |
| `k6-api-spike.js` | `pnpm --dir server perf:spike` | Separately measures 10/s baseline, a one-minute 40/s spike, and recovery at 10/s |
| `performance-test.js` | `pnpm --dir server perf:readonly` | Health, CSRF, catalog listing, product detail, reviews, search, and facets |
| `k6-catalog-test.js` | `pnpm --dir server perf:catalog` | Public catalog listing, detail, search, facets, related products, reviews, CSRF, and optional recommendations |
| `k6-admin-readonly.js` | `pnpm --dir server perf:admin-readonly` | Admin orders, order items, users, profiles, analytics, inventory movements, and promotions |
| `k6-customer-readonly.js` | `pnpm --dir server perf:customer-readonly` | Customer orders, addresses, and notifications |
| `k6-auth-readonly.js` | `pnpm --dir server perf:auth-readonly` | Authenticated profile, orders, cart, validation, wishlist, addresses, and notifications |

Run the smoke profile from any supported shell:

```text
pnpm --dir server perf:smoke
```

The smoke profile defaults to one virtual user for 20 seconds, checks that
fewer than 1% of HTTP requests fail, requires p95 response time below 1.2
seconds, and requires at least 99% of assertions to pass. The seeded catalog
needs two products in the same category to exercise comparison. Keep smoke
settings within the bounded profile:

```dotenv
SMOKE_VUS=2
SMOKE_DURATION=30s
```

Run a bounded, read-only catalog load profile against the local API:

```text
pnpm --dir server perf:load
```

The load profile models one catalog workflow per second by default. Each
workflow makes four sequential `GET` requests, so the default load is about four
API requests per second. It ramps up for 30 seconds, holds the configured rate
for two minutes, then ramps down for 30 seconds. `LOAD_RATE` can be set from 1
to 5 workflows per second and `LOAD_DURATION` from 10 seconds to 5 minutes.
Thresholds include per-endpoint p95 latency, failed-request and check rates,
and zero dropped iterations. A timestamped JSON summary is written under
`server/test-results/k6/`, which is ignored by Git.

Example bounded override:

```dotenv
LOAD_RATE=1
LOAD_DURATION=30s
```

Run the staged concurrent-user capacity profile against the local API:

```text
pnpm --dir server perf:capacity
```

Run the API in `NODE_ENV=test` against the isolated Docker database for this
profile. Test mode uses the configured route ceilings so the local development
rate limit of 10,000 requests per IP per 15 minutes does not reject the load
profile before its capacity is measured. Do not use test mode with production
data or services.

The capacity profile runs four sequential stages at 10, 25, 50, and 100 virtual
users. Each stage ramps for 30 seconds, holds for one minute, and ramps down for
30 seconds. Each VU performs catalog list, search, product detail, and facets
requests, then waits one second before repeating. The profile requires request
errors below 1%, checks above 99%, and p95 below 1.2 seconds for each endpoint
at each load level. Its timestamped JSON summary is written under
`server/test-results/k6/`.

`dropped_iterations` applies to arrival-rate executors, not the `ramping-vus`
executor used by this profile. Use `perf:load` for the fixed-arrival-rate test,
which also requires zero dropped iterations.

Run the bounded catalog stress profile against the local API:

```text
pnpm --dir server perf:stress
```

Use `NODE_ENV=test` and the isolated Docker database. The profile starts five
sequential stages at 10, 20, 40, 60, and 80 catalog workflows per second. Each
workflow makes four read-only API requests, so the target rates correspond to
about 40–320 requests per second. Each stage ramps for 30 seconds, holds for
one minute, and ramps down for 10 seconds. The full profile is bounded to about
9 minutes and a maximum rate of 80 workflows/second.

Each stage aborts the run after 30 seconds of evidence if request errors reach
1%, any iterations are dropped, checks fall to 99% or below, or any endpoint
p95 reaches 1.2 seconds. The first failing stage identifies the current local
breaking point; later stages will not run after an SLO breach. This ceiling is
based on the previous local 100-VU result of about 298 requests/second. Increase
it only after reviewing
the API/database and k6-generator resource metrics. The timestamped JSON summary
is written under `server/test-results/k6/`.

Run the long-duration soak profile against the isolated test API and database:

```text
pnpm --dir server perf:soak
```

`SOAK_RATE` accepts 1-20 catalog workflows/s and `SOAK_DURATION` accepts 10m-
60m. Defaults are 20 workflows/s for 30 minutes. The profile ramps for 30
seconds, holds the configured rate, then ramps down. It checks failed request
rate below 1%, zero dropped iterations, checks above 99%, and endpoint p95 below
1.2 seconds. The runner writes a timestamped JSON summary under
`server/test-results/k6/`.

Run the baseline, sudden-spike, and recovery profile against the same isolated
target:

```text
pnpm --dir server perf:spike
```

`SPIKE_BASELINE_RATE` defaults to 10 workflows/s (range 1-20), and `SPIKE_RATE`
defaults to 40/s (must exceed baseline and stay at or below 80/s). The profile
runs a two-minute baseline, one-minute spike, and two-minute recovery, with a
10-second quiet gap between phases so in-flight iterations can drain. Each
phase has separate error, dropped-iteration, check, and endpoint p95 thresholds.
The runner writes a timestamped JSON summary under `server/test-results/k6/`.

Arrival-rate profiles also require enough k6 VUs to start each iteration on
schedule. Review `dropped_iterations` separately: drops can indicate a VU pool
that is too small or an overloaded system, so they are not interchangeable
with HTTP errors.

Use `BASE_URL=http://127.0.0.1:4000` for a host-installed k6 CLI. If k6 runs in
Docker, target the host API with `BASE_URL=http://host.docker.internal:4000` and
set `ALLOW_REMOTE_TEST_TARGET=true`; this explicit flag is needed because the
container sees the host name as a remote target. Keep this pointed at a local
or disposable test API. From PowerShell, the container can run the bounded
load profile without installing k6 on the host:

```powershell
New-Item -ItemType Directory -Path server/test-results/k6 -Force | Out-Null
docker run --rm -v "${PWD}/server/test:/work/test" -v "${PWD}/server/test-results/k6:/work/test-results/k6" -w /work --add-host host.docker.internal:host-gateway -e BASE_URL=http://host.docker.internal:4000 -e ALLOW_REMOTE_TEST_TARGET=true -e LOAD_RATE=1 -e LOAD_DURATION=30s grafana/k6:1.5.0 run test/k6-api-load.js
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
