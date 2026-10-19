# Public resource identifiers

## Goal and scope

Give orders, support tickets, and after-sales requests stable UUID v7 public
references while retaining existing auto-increment primary keys and foreign keys.
Keep numeric API compatibility, authorization, guest capabilities, and financial
idempotency intact. Other tables retain their existing key strategy.

## Acceptance criteria

- Existing and newly inserted rows have unique, non-null UUID v7 public IDs.
- Public IDs remain stable across updates and retries.
- APIs return public IDs and accept them at the affected resource boundaries.
- Legacy numeric links and cached responses continue to work.
- Public references resolve to numeric IDs before internal state changes.
- Client calls prefer public IDs without changing parent/item relationships.
- Foreign-resource access, invalid references, and incorrect guest tokens fail.

## Implementation and verification

1. Add the forward SQL migration and Prisma projection; test backfill/defaults
   against an isolated MySQL instance with populated legacy tables.
2. Add a dependency-free RFC 9562 generator and strict identifier parser.
3. Update order/support/after-sales repositories, service boundaries and validators.
4. Update client types, API wrappers, navigation and guest lookup/recovery.
5. Run focused regression tests, package checks, and database integration checks;
   record environment failures separately from implementation defects.

See [the decision](../../Wiki/decisions/0007-public-resource-identifiers.md) for
contracts, migration ordering, deployment constraints, and sources.

## Verification recorded on 2026-10-19

- `pnpm --dir server prisma:validate`: passed.
- `pnpm --dir server typecheck`, `pnpm --dir server build`,
  `pnpm --dir server lint`: passed.
- `pnpm --dir server test -- --run --maxWorkers=2`: passed 894 Vitest tests
  across 152 files and all seven Docker command-plan checks. Later targeted
  controller checks passed 17 tests, including two additional public-reference
  shipping tests; Scalar/OpenAPI checks passed two tests.
- `pnpm --dir server exec vitest run --config vitest.integration.config.ts`:
  passed 24 tests, with two existing tests skipped, against disposable MySQL 8.0
  after importing the baseline and applying all forward SQL migrations. A later
  order integration run passed four tests including the added public-reference
  ownership check. The migration test verifies backfill, UUID layout/timestamp,
  uniqueness, non-null enforcement, old insert compatibility and ID stability.
- Integration runs require local `retail_p0_test`, explicit database credentials,
  `DB_SSL=false`, `EMAIL_PROVIDER_MODE=sandbox`, `PAYMENT_PROVIDER_MODE=mock`, and
  the routing/tile allowlists used by the integration fixtures. Earlier attempts
  failed on target-name guards, MySQL authentication and inherited live settings;
  the successful run used the isolated sandbox configuration.
- `pnpm --dir client exec tsc -p tsconfig.json --noEmit`,
  `pnpm --dir client lint`, `pnpm --dir client build`: passed.
- Focused client Vitest: five files, 24 tests passed. Full client Vitest:
  616 passed, one failure in the product-comparison price assertion at
  `client/src/features/products/pages/__tests__/ProductComparisonPage.test.tsx:148`.
  Its product source was already modified before this task and was not changed
  by the identifier implementation.
- `git diff --check`: passed. GitNexus impact and change analysis ran; aggregate
  change risk is CRITICAL and includes extensive unrelated, pre-existing changes
  in this shared working tree. Direct caller review and targeted authorization
  regressions supplement the graph result.
- No browser validation, production migration, deployment, or commit performed.
