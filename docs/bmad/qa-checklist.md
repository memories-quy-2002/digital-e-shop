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
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --filter client build
pnpm --filter client lint

# Backend
pnpm --filter server typecheck
pnpm --filter server build
pnpm --filter server lint
```

- [ ] Relevant checks pass (note any that couldn't run, and why).

## Contracts & security

- [ ] API response shapes preserved (route-local `msg`/`error`/data keys) unless change was requested.
- [ ] Write payloads validated (Zod) before persistence.
- [ ] `requireAuth` / `requireAdmin` / `requireOwnerOrAdmin` enforced where applicable.
- [ ] CSRF flow intact; login/register/refresh exceptions not broadened.
- [ ] No secrets, tokens, cookies, or PII logged or committed.

## Data

- [ ] Schema changes applied across all layers (repository, service, validator, types, Prisma).
- [ ] Multi-table flows (checkout, inventory, timeline, addresses, notifications) verified.

## Scope & quality

- [ ] Change is small and reviewable; no unrelated rewrites.
- [ ] No unnecessary dependencies added.
- [ ] Style matches surrounding code.

## Documentation

- [ ] `Wiki/` updated for architecture / API / schema / business-logic changes; `Wiki/log.md` appended; `Wiki/index.md` date bumped.
- [ ] Summary of changed files, behavior changes, verification, assumptions, and risks provided.
