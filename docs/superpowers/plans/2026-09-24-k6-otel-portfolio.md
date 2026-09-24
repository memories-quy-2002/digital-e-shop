# k6, OpenTelemetry, and portfolio README

## Goal

Add a low-load, read-only API smoke test, opt-in OpenTelemetry signals for the NestJS API, and a concise portfolio README grounded in the repository's actual implementation.

## Scope and acceptance criteria

1. **k6 first:** Add a public API smoke profile for health, catalog listing/search/facets, product detail, and same-category comparison when seeded data supports it. Default to localhost, low VUs, and a short duration. Reject remote targets unless explicitly marked as an approved test target. Assert response contracts and latency/error thresholds. Keep existing authenticated read-only profiles intact.
2. **OpenTelemetry:** Initialize before Nest/Express and database modules load. Export HTTP request metrics/traces and MySQL2 spans/metrics over OTLP when explicitly enabled. Keep telemetry disabled by default, avoid recording query strings and SQL literals, and include trace/span IDs in request logs while preserving request IDs.
3. **README:** Lead with project purpose, verifiable engineering highlights, architecture/stack, setup, and quick verification commands. Link to maintained docs; avoid claims that cannot be verified from the repository.
4. Update server environment examples and the architecture Wiki for the telemetry contract.

## Verification

- Run the k6 smoke profile only against the local development API or an explicitly approved test deployment; do not create or mutate records.
- Run server typecheck, lint, focused tests, and build.
- Verify the client/server services are not started or stopped by this work.
- Review the complete diff, lockfile scope, and tracked environment files for secrets.
