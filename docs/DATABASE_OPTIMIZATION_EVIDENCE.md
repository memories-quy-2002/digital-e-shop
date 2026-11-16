# Database optimization evidence

This page defines how to verify the bounded catalog aggregate optimization on
the branch. It separates deterministic unit checks from MySQL execution-plan and
timing evidence. A passing unit test does not prove query parity or a production
latency improvement.

## Scope

The bounded product detail, comparison, default paginated catalog, and admin
paginated catalog paths calculate review rating/count and active reservation
quantity for each returned product. The filtered/search listing keeps its
whole-catalog rating aggregate because rating participates in its sort order.
The unpaginated compatibility endpoint is outside this optimization.

The benchmark compares the prior whole-catalog aggregates and the current
product-scoped projections over the same deterministic fixture rows for each
optimized path. The unchanged filtered listing is a control. It checks returned
projection parity before reporting performance measurements.

## Run the repeatable database demo

Use a disposable MySQL instance only. Do not point the demo at production,
shared development data, or a database containing user data. The script requires
an explicit disposable-target opt-in and accepts only a loopback database host
and a dedicated benchmark database name. Start a one-off MySQL container with
temporary storage. The example password below is only for this disposable local
container:

```powershell
docker run -d --rm --name digital-e-catalog-bench `
  --tmpfs /var/lib/mysql:rw,noexec,nosuid,size=1g `
  -p 127.0.0.1:3308:3306 `
  -e MYSQL_ROOT_PASSWORD=benchmark-only-password `
  -e MYSQL_DATABASE=catalog_bench_local `
  mysql:8.0
docker exec digital-e-catalog-bench mysqladmin ping -uroot -pbenchmark-only-password --silent
```

Set the connection values in the current shell (never commit real credentials):

```powershell
$env:CATALOG_BENCH_ALLOW_DISPOSABLE = "1"
$env:DB_HOST = "127.0.0.1"
$env:DB_PORT = "3308"
$env:DB_NAME = "catalog_bench_local"
$env:DB_USER = "root"
$env:DB_PASSWORD = "benchmark-only-password"
pnpm --dir server exec node scripts/database-optimization/catalog-query-benchmark.mjs
docker stop digital-e-catalog-bench
```

The demo creates uniquely named fixture tables, inserts deterministic products,
reviews, pending checkout reservations, and expired/non-pending reservations,
then drops only those fixture tables. It does not create or drop the database.
The default seed sizes and iteration counts are printed in the report; record
them with any comparison. JSON output is also saved beneath the ignored
`server/test-results/database-optimization/` directory.

This is a projection microbenchmark of the before/after aggregate SQL, not an
execution of full repository endpoint SQL, controllers, connection pooling, or
HTTP request handling.

The report should include MySQL version, fixture cardinalities, query case,
before/after result parity, `EXPLAIN ANALYZE` plans, warm-up and measured run
counts, and latency summaries. Treat the result as a local demonstration tied to
that MySQL version, hardware, cache state, and fixture size; it is not a
production SLO or proof of live customer impact.

## Recorded demonstration

The checked-in [MySQL 8.0.46 report](evidence/database-optimization/catalog-benchmark-2026-11-16-mysql-8.0.46.json)
is a synthetic projection microbenchmark, not a run of the complete repository
queries or HTTP endpoints. It used a disposable tmpfs container on 2026-11-16:
5,000 products, 94,740 reviews, 263 products without reviews, 498 reservations
(448 active), 3 warm-ups, and 15 measured runs per query form. All five cases
passed row parity.

| Case                              | Legacy median / p95 (ms) | Scoped median / p95 (ms) | Median change |
| --------------------------------- | -----------------------: | -----------------------: | ------------: |
| Product detail                    |          43.661 / 50.721 |            0.984 / 1.612 |       -97.75% |
| Comparison (3 products)           |          41.097 / 51.021 |            0.830 / 1.168 |       -97.98% |
| Storefront page (10 rows)         |          40.026 / 43.231 |            0.931 / 1.202 |       -97.67% |
| Admin page (10 rows)              |          41.415 / 43.983 |            0.948 / 1.322 |       -97.71% |
| Filtered rating control (10 rows) |          45.681 / 52.015 |          45.506 / 53.646 |        -0.38% |

The plans show the legacy detail query materializing aggregates over all 94,740
reviews and the scoped version looking up the selected product's 20 reviews via
`idx_product`. The filtered rating control still scans all products/reviews and
sorts by rating, as intended. With 15 measured samples, reported p95 is the
highest observed sample; these values demonstrate query-shape behavior on this
fixture and are not a stable percentile estimate. They do not establish an
endpoint or production speedup.

## Definition of Done

- [x] Repository unit tests assert bounded SQL shape, parameterized pagination,
      scoped rating/count/reservation predicates, clamped availability, and the
      intentionally unchanged rating-aware filtered listing.
- [x] The isolated MySQL demo runs all four optimized paths and the filtered
      control against the same deterministic fixture data.
- [x] Before/after outputs match for product IDs, rating, review count, and
      available stock, including products with no reviews, no active reservations,
      expired reservations, and non-pending reservations.
- [x] Each query plan is captured with `EXPLAIN ANALYZE`; indexes and access
      paths are reviewed rather than inferred from query text alone.
- [x] Timings include warm-up plus repeated runs for both query forms, with
      identical fixture, server, connection settings, and measurement conditions.
      Report raw samples or reproducible summaries; do not claim an improvement if
      the observed result is neutral or slower.
- [x] The generated JSON artifact is retained with the review evidence when a
      benchmark run is performed. Do not commit machine-specific output unless the
      PR explicitly needs a representative checked-in sample.
- [x] Typecheck, focused repository tests, and the server's portable test suite
      pass. MySQL integration/performance evidence is reported separately from
      mocked unit coverage.
- [x] No benchmark ran against production or shared data; no schema, endpoint,
      ordering, pagination, or response-contract change was introduced.

## Evidence limits

The repository unit tests inspect SQL generated by the repository with mocked
database calls. They guard query shape and compatibility choices, but do not
execute MySQL, compare actual rows, or establish a speedup. The benchmark's
fixture parity and `EXPLAIN ANALYZE` results establish behavior and plan evidence
for the tested synthetic dataset only. A real production improvement still
requires representative production-like cardinalities and safe, read-only
measurements in an approved non-production environment. Do not use k6 against
production; HTTP-level k6 results also include application, network, and pool
effects and should not be presented as isolated SQL timing.
