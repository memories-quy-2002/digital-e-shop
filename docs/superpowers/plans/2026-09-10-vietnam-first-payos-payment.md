# Vietnam-first PayOS checkout implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use test-driven-development for each new provider or checkout behavior.

**Goal:** Make Vietnam the primary checkout market by implementing a real PayOS payment-link flow in VND, while preserving the existing Stripe flow as an optional international rail and keeping cash/bank transfer available.

**Architecture:** Keep MySQL as the operational source of truth. Reuse the existing authoritative cart validation, inventory reservation, promotion reservation, order finalization, payment ledger, guest token, and webhook boundaries. Add a PayOS adapter and a provider-neutral reference on pending checkouts so PayOS and Stripe cannot be confused. PayOS webhooks, not return URLs, finalize orders.

**Scope boundary:** Product/catalog prices and historical orders remain USD-canonical in this increment. PayOS receives a server-calculated integer VND quote, and the payment ledger snapshots the VND amount and FX rate. A later migration may make catalog pricing VND-native after business pricing is ready.

## Global constraints

- Work directly on the current branch and preserve unrelated dirty worktree changes.
- Use independent package commands with `pnpm --dir client ...` and `pnpm --dir server ...`.
- Never trust client totals, payment status, PayOS query parameters, or return URLs.
- Do not expose PayOS credentials to the client or commit real secrets.
- Keep guest order access tokens out of provider payloads, URLs, logs, and persisted PII.
- Keep existing Stripe webhook behavior and route contracts compatible.
- Do not run production migrations, seed/reset databases, commit, push, or modify `main`.

---

### Task 1: PayOS provider adapter and configuration — complete

**Files:**

- Create `server/src/payments/payos.service.ts`
- Create `server/src/payments/payos.service.test.ts`
- Modify `server/src/payments/payments.module.ts`
- Modify `server/src/config/env.config.ts`
- Modify `server/src/payments/payment-provider.service.ts`
- Modify `server/.env.example` and `server/.env.docker.example`
- Update `server/package.json` and `server/pnpm-lock.yaml` only if the official SDK is added

**Behavior:**

- Use the official `@payos/node` SDK boundary with lazy initialization.
- Expose `isConfigured`, `createPaymentLink`, `cancelPaymentLink`, and `verifyWebhook`.
- Generate a numeric PayOS `orderCode` without exposing reservation tokens or guest tokens.
- Return a checkout URL, payment link ID, order code, amount, and VND currency.
- Fail closed with a 503-style domain error when live mode lacks credentials.
- Keep mock mode deterministic and local; it must not claim a live PayOS settlement.

**Verification:** focused adapter tests, server typecheck, and server build.

### Task 2: Provider-neutral pending checkout references — complete

**Files:**

- Create additive Prisma migration under `server/src/database/prisma/migrations/`
- Modify `server/src/database/prisma/schema.prisma`
- Modify `server/src/orders/orders.types.ts`
- Modify `server/src/orders/checkout-reservation.repository.ts`
- Modify `server/src/orders/checkout-reservation.service.ts`
- Modify `server/src/orders/orders.repository.ts`

**Behavior:**

- Add `payment_provider` and `provider_reference` to `pending_checkouts` with a unique provider/reference index.
- Preserve `stripe_session_id` for existing Stripe compatibility and existing tests.
- Add generic attach/find/expire helpers without weakening reservation expiry or status checks.
- Keep promotion reservations released exactly once.

**Verification:** reservation unit tests plus Prisma format/validate; do not apply the migration to a production or remote database.

### Task 3: PayOS reserved checkout and webhook finalization — complete

**Files:**

- Create `server/src/orders/orders.payos.service.ts` and focused tests
- Create `server/src/payments/payosWebhook.controller.ts` and module wiring
- Modify `server/src/orders/orders.controller.ts`
- Modify `server/src/orders/orders.service.ts`
- Modify `server/src/orders/orders.module.ts` and `server/src/app.module.ts` as needed
- Modify validators/DTOs/types

**Behavior:**

- Authenticated and guest PayOS checkout endpoints reuse authoritative cart preview and reserve stock before creating a payment link.
- The server computes the payable amount and converts it to integer VND using the configured rate.
- The PayOS request contains only safe checkout metadata; guest token and reservation token never leave the server.
- Provider/link creation or attachment failure releases the reservation and its promotion hold.
- The webhook verifies the PayOS signature, requires successful payment data, matches order code/payment link and exact VND amount, then calls an idempotent provider-neutral reservation finalizer.
- Duplicate webhook deliveries return 2xx without decrementing stock or creating a second order.
- Invalid signature, currency, amount, or reference returns a non-success response and leaves the reservation pending for safe retry/inspection.

**Verification:** unit tests for auth/guest link creation, failure release, signature validation, amount mismatch, and duplicate webhook delivery.

### Task 4: Client checkout behavior and Vietnam-first presentation — complete

**Files:**

- Modify `client/src/features/orders/api.ts`
- Modify `client/src/features/orders/types.ts`
- Modify `client/src/features/orders/components/CheckoutPaymentPage.tsx`
- Modify `client/src/features/orders/components/CheckoutPaymentPage.test.tsx`
- Modify `client/src/features/orders/pages/CheckoutSuccessPage.tsx` only if pending PayOS state needs polling/status wording

**Behavior:**

- Selecting PayOS redirects to the server-created PayOS checkout URL rather than creating an order immediately.
- Guest checkout stores only the raw guest access token and non-sensitive summary in session storage, matching the existing Stripe flow.
- The success page polls the provider-neutral pending reference through the existing protected guest/auth flow and only shows confirmed order data after webhook finalization.
- Copy explicitly states that PayOS is the Vietnam-primary option and shows the VND quote/redirect behavior without hard-coding a client-side FX calculation.
- Stripe remains available only where its server capability is configured; cash and bank transfer remain immediate/manual paths.

**Verification:** focused Vitest/Testing Library tests, client typecheck, build, and lint.

### Task 5: Documentation and review — complete

**Files:**

- Update `docs/API.md`, `docs/DEVELOPMENT.md`, and relevant checkout docs
- Update `Wiki/decisions/0003-payment-ledger-and-usd-canonical-currency.md` or add a focused ADR for the Vietnam-first PayOS boundary
- Update `Wiki/index.md` and append `Wiki/log.md` only if the implementation changes documented architecture

**Behavior:**

- Document required PayOS env vars, webhook route/configuration, mock/live behavior, VND quote semantics, and the fact that return URL is not proof of payment.
- Record that USD remains the current canonical internal price until a separate catalog-pricing migration is approved.

**Final verification:** review the diff for scope creep, secrets, auth/CSRF regressions, SQL safety, and run the relevant package checks. Report live PayOS verification separately if credentials/webhook access are unavailable.

**Implementation note:** Automated verification covers the adapter, quote/amount checks, reservation release, duplicate webhook handling, guest/authenticated checkout contracts, and status polling. A live merchant payment was not executed because this workspace contains only placeholder environment values.
