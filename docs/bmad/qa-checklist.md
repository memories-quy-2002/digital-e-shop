# QA checklist

Run this checklist before considering non-trivial work complete. Skip items that
do not apply, and record why a relevant check could not run.

## Correctness and state

- [ ] Acceptance criteria from the PRD and stories are met
- [ ] Happy, loading, empty, validation, permission, retry, and failure states
  behave as expected
- [ ] Duplicate requests, retries, stale data, and concurrency are handled
- [ ] Error messages explain the next action without exposing internals

## Visual UI and UX

- [ ] English and Vietnamese copy use the existing i18n path and remain aligned
- [ ] Light and dark themes use existing tokens with readable contrast
- [ ] Desktop and mobile routes have no unintended horizontal overflow
- [ ] Hierarchy, spacing, typography, CTA labels, and imagery support the task
- [ ] Forms have visible labels, inline errors, loading or disabled feedback,
  focus states, and recovery actions
- [ ] Touch targets, keyboard navigation, dialogs, accessible names, and reduced
  motion meet the existing UI conventions
- [ ] Changed routes were checked in a real browser with desktop and mobile
  evidence when the environment supports it

## Logic, data, and security

- [ ] Write payloads are validated with Zod before persistence
- [ ] Server-side prices, stock, promotions, totals, and ownership are trusted
- [ ] `AuthGuard`, `RolesGuard`, `OwnerParam`, CSRF, rate limits,
  and route aliases remain intact
- [ ] No secrets, tokens, cookies, PII, or payment credentials are logged or
  committed
- [ ] Multi-table flows cover checkout, inventory, timeline, addresses,
  notifications, and payment ledger effects as relevant
- [ ] Guest flows expose only token-protected, guest-safe fields
- [ ] PayOS and COD keep exact whole-number VND amounts, verified webhook
  finalization, duplicate-event protection, and guarded COD confirmation
- [ ] If after-sales is in scope, the server enforces seven calendar days after
  successful delivery and records the request and operator actions

## Contracts and architecture

- [ ] Route-local response keys such as `msg`, `error`, and data keys are
  preserved unless a contract change was approved
- [ ] Client and server remain independently installable
- [ ] Client feature, API, context, and shared HTTP boundaries remain clear
- [ ] Nest controllers stay thin, services coordinate business logic, and
  repositories own SQL
- [ ] MySQL and the partial Prisma migration boundary remain aligned
- [ ] No unnecessary dependency, abstraction, or unrelated rewrite was added

## Verification commands

Run the commands relevant to the touched surface:

```powershell
# Frontend
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir client lint

# Backend
pnpm --dir server typecheck
pnpm --dir server test -- --run
pnpm --dir server build
pnpm --dir server lint

# Only with an isolated database
pnpm --dir server test:integration
```

- [ ] Relevant checks pass
- [ ] Browser routes, viewport sizes, locales, themes, and outcomes are
  recorded for UI changes
- [ ] Environment failures are separated from application failures

## Documentation and handoff

- [ ] `Wiki/` is updated for architecture, API, schema, or business-logic
  changes
- [ ] `Wiki/index.md` date is bumped and `Wiki/log.md` receives one line
- [ ] The final summary lists changed files, behavior, verification,
  assumptions, and remaining risks
