# QA Checklist

Run before considering a non-trivial change done. Skip irrelevant items for small changes.

## Correctness

- [ ] Acceptance criteria from the story/PRD are met.
- [ ] Loading / empty / error / success states handled (frontend).
- [ ] Edge cases and invalid input handled.

## Verification commands

Run those relevant to the touched surface (see [AGENTS.md](../../AGENTS.md) → Verification commands):

```powershell
# Frontend
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir client lint

# Backend
pnpm --dir server typecheck
pnpm --dir server test -- --run
pnpm --dir server test:integration  # requires the configured MySQL integration DB
pnpm --dir server build
pnpm --dir server lint
```

- [ ] Relevant checks pass (note any that couldn't run, and why).

## Contracts & security

- [ ] API response shapes preserved (route-local `msg`/`error`/data keys) unless change was requested.
- [ ] Write payloads validated (Zod) before persistence.
- [ ] `AuthGuard`, `RolesGuard`, and `OwnerParam` enforce authentication, roles, and ownership where applicable.
- [ ] CSRF flow intact; login/register/refresh exceptions not broadened.
- [ ] No secrets, tokens, cookies, or PII logged or committed.

## Data

- [ ] Schema changes applied across all layers (repository, service, validator, types, Prisma).
- [ ] Multi-table flows (checkout, inventory, timeline, addresses, notifications) verified.
- [ ] Guest checkout still revalidates price, stock, promotions, and totals server-side; raw guest tokens are not logged or returned in admin payloads.

## Scope & quality

- [ ] Change is small and reviewable; no unrelated rewrites.
- [ ] No unnecessary dependencies added.
- [ ] Style matches surrounding code.

## Documentation

- [ ] `Wiki/` updated for architecture / API / schema / business-logic changes; `Wiki/log.md` appended; `Wiki/index.md` date bumped.
- [ ] Summary of changed files, behavior changes, verification, assumptions, and risks provided.
