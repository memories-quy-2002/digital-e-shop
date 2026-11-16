# Database concurrency and query performance

This is the maintained database engineering convention for Digital-E. The runtime
persistence layer is MySQL/InnoDB via mysql2 repositories, with Prisma migrations
and selected typed reads. Do not change isolation globally or migrate all SQL to
Prisma as part of performance cleanup.

## Concurrency decision matrix

| Workload                                               | Preferred mechanism                               | Notes                                                                                            |
| ------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Single-row arithmetic (available stock, counters)      | Atomic conditional UPDATE + affectedRows check    | Check bounds and reject unsuccessful writes                                                      |
| Multiple related writes / inventory reservations       | withTransaction + ordered SELECT ... FOR UPDATE   | Lock the canonical rows before inspecting dependent state; commit all business writes atomically |
| Human-edited documents (stock counts, purchase orders) | version/revision compare-and-swap                 | Include the expected version in WHERE; return 409 on mismatch                                    |
| Background task leasing                                | Bounded FOR UPDATE SKIP LOCKED with fencing token | Call providers only after commit, outside the transaction                                        |
| Purely read-only public queries                        | Non-locking SELECT                                | Avoid FOR UPDATE on browsing/catalog endpoints                                                   |

- For multi-product writes, deduplicate and sort product IDs consistently before locking.
  Keep a consistent lock order between order, payment, product, inventory and related
  tables where possible; audit cross-workflow ordering before adding a new lock.
- Use the same transaction connection for the complete lock/read/validate/write
  sequence. Never issue START TRANSACTION/COMMIT/ROLLBACK through pool.query.
- A SELECT ... FOR UPDATE is not a substitute for a conditional UPDATE or a
  uniqueness constraint. Verify affectedRows and define the conflict response.
- Do not infer the production isolation level from code: inspect the server's
  transaction_isolation setting, lock waits and transaction traces.
- Check both pending checkout holds and physical stock before promises of availability;
  the inventory reservation model is not the same as an immediate stock deduction.

## Retry policy

Use withTransaction() by default. withRetryableTransaction() is **opt-in** and
only for entirely database-local callbacks that are safe to execute again after
rollback. It retries MySQL deadlocks (1213/ER_LOCK_DEADLOCK) and lock-wait timeouts
(1205/ER_LOCK_WAIT_TIMEOUT), at most three times by default, with bounded
exponential backoff and jitter. It never retries after the callback has finished,
because an error while committing can leave an unknown commit outcome.

Eligible today: idempotent cart-merge mutations, identified by userId and operationId.
Other transaction types require explicit review. Never put PayOS/provider calls,
emails, Kafka publishing or non-transactional side effects in a retryable callback.
Payment/finalization must use their existing idempotency, durable tasks and
reconciliation paths instead of speculative replay.

## Query performance rules

1. Return bounded pages on hot storefront/admin paths and use deterministic ORDER BY.
   The legacy GET /products unpaginated response is retained for API compatibility;
   measure its usage and deprecate explicitly rather than silently truncating it.
2. Scope review and reservation aggregation to the requested product IDs on bounded
   detail, comparison and ID-ordered pages. The filtered/search listing intentionally
   retains its rating-aware aggregation, since rating influences its ordering.
3. Parameterize user-supplied values. Avoid string-interpolated IDs, sort expressions,
   and raw SQL supplied by the client. Select only columns needed for the contract.
4. Benchmark queries with actual cardinalities. Use EXPLAIN ANALYZE on a disposable or
   approved read-only environment; compare rows examined, plans, p50/p95 latency,
   sort/temp-table cost and scan amplification. Verify supporting indexes rather than
   adding indexes blindly. See [Database optimization evidence](DATABASE_OPTIMIZATION_EVIDENCE.md)
   for the bounded catalog aggregate demo, its DoD, and the recorded synthetic MySQL
   report.
5. For LIKE '%term%' and computed expressions (LOWER/REPLACE), regular B-tree indexes
   may not help. Consider pre-normalized searchable fields or FULLTEXT only after
   profiling and verifying language/search semantics.
6. Avoid long external I/O inside a transaction. Move notifications and provider
   calls outside the lock window, using outbox/task records for durability where needed.
7. Never introduce extra queries just for diagnostics on hot production paths.

## Observability and capacity

- Set DB_QUERY_LOG=true and DB_QUERY_LOG_THRESHOLD_MS to enable slow query reports.
  Pool queries and transaction-context queries both report elapsed time when enabled,
  without bound parameters. Avoid enabling SQL text logging indiscriminately in
  production; verify sensitive literals are not interpolated.
- DB_EXPLAIN_SLOW may execute additional SELECT plans: use only in a controlled
  environment, not under live load.
- The MySQL pool currently has 10 connections **per application instance** and an
  unbounded wait queue. Before tuning, measure instance count, active connections,
  saturation/queue wait and managed database connection limits; serverless instances
  multiply pool capacity.
- Monitor deadlock count, lock-wait latency, transaction duration, timed-out writes,
  retry attempts and inventory 409 conflicts. Regressions require evidence, not
  speculative index/isolation changes.

## Verification and rollout

Run against a disposable MySQL database with the expected legacy baseline and
all forward migrations:

    pnpm --dir server typecheck
    pnpm --dir server lint
    pnpm --dir server test -- --run
    pnpm --dir server test:integration
    pnpm --dir server build

Concurrent acceptance: simultaneous cart merges with one operation key must be
replay-safe; two distinct checkout reservations for last-unit stock must not
oversell; concurrent stock-count approval and product mutation must yield a
version conflict; payment finalization must not create duplicate orders. Simulate
deadlocks (1213), lock timeouts (1205), business errors and ambiguous COMMIT
separately. Verify rollback and connection release, and never retry ambiguous
provider/COMMIT outcomes.

For performance, run the repository's read-only k6 catalog/capacity profiles
against a seeded test DB, compare before/after p95 and failed-check rate, and
save EXPLAIN plans for the product detail, comparison, paginated catalog and
filtered listing. No live load test and no production migration is authorized
by this guide.
