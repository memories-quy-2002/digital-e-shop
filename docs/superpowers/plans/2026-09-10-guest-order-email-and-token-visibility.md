# Guest Order Email and Token Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mask guest order access tokens with explicit Copy/Reveal controls and send Resend confirmation emails after any successfully committed order with a valid customer email.

**Architecture:** Keep the token as a client-visible bearer credential without persisting its raw value. Use one injectable server email boundary for guest and authenticated confirmation mail after immediate checkout or Stripe reservation finalization; resolve authenticated recipient identity from the server user record and swallow delivery errors after logging safe metadata. Use Resend's HTTP API through built-in `fetch` so no runtime package is added.

**Tech Stack:** React 19, Vitest + Testing Library, NestJS 11, TypeScript, MySQL repositories, Resend HTTP API, Node 24 built-in `fetch`.

## Global Constraints

- Do not commit `.env` files, API keys, access tokens, or production credentials.
- Add only placeholder values to tracked environment templates.
- Do not include the raw guest token in the email, URL, logs, database, or Stripe metadata.
- Send only to a server-authoritative, valid customer email; skip missing or invalid email addresses without failing the order.
- Email delivery must never roll back a committed order or create a second order.
- Preserve the existing guest lookup contract and independent client/server packages.
- Keep existing Support theme changes out of this feature's staged scope.

---

### Task 1: Add failing client token-visibility tests

**Files:**
- Modify: `client/src/features/orders/pages/CheckoutSuccessPage.test.tsx`

**Interfaces:**
- Consumes: existing `CheckoutSuccessPage` guest success rendering.
- Produces: regression coverage for masked input, reveal/hide, and clipboard copy.

- [ ] **Step 1: Write the failing tests**

Add assertions that the guest token input starts with `type="password"`, the
Reveal button changes it to `text`, Hide changes it back, and Copy calls
`navigator.clipboard.writeText` with the raw value.

- [ ] **Step 2: Run the focused test**

Run `pnpm --dir client exec vitest run src/features/orders/pages/CheckoutSuccessPage.test.tsx`.
Expected: FAIL because the current page renders a plain text input and has no
Reveal/Hide control.

### Task 2: Implement the client token controls

**Files:**
- Modify: `client/src/features/orders/pages/CheckoutSuccessPage.tsx`
- Modify: `client/src/styles/features/orders/_checkout-success.scss`

**Interfaces:**
- Consumes: `combinedData.guestOrderToken` and existing clipboard handler.
- Produces: accessible masked token input with separate Reveal/Hide and Copy
  buttons, responsive within the existing guest-access block.

- [ ] **Step 1: Implement the minimal state and controls**

Add `showGuestToken` state, set the token input type from that state, add an
accessible toggle button, and keep Copy as a separate button using the existing
handler.

- [ ] **Step 2: Add focused styles**

Style the field/action wrapper so the controls remain usable at desktop and
mobile widths without changing unrelated checkout-success layout.

- [ ] **Step 3: Run the focused client test**

Run `pnpm --dir client exec vitest run src/features/orders/pages/CheckoutSuccessPage.test.tsx`.
Expected: PASS with the new behavior and all existing guest success cases green.

### Task 3: Add the server Resend email boundary and environment contract

**Files:**
- Create: `server/src/email/resend-email.service.ts`
- Create: `server/src/email/email.module.ts`
- Modify: `server/src/config/env.config.ts`
- Modify: `server/.env.example`
- Modify: `server/.env.docker.example`

**Interfaces:**
- Consumes: order confirmation input with order ID, customer type, email,
  contact, amount, payment method, shipping, and item snapshots.
- Produces: `ResendEmailService.sendOrderConfirmation(input): Promise<void>`.

- [ ] **Step 1: Write failing service tests**

Create `server/src/email/__tests__/resend-email.service.test.ts` covering the
no-key no-op, exact Resend request headers/body, raw-token exclusion, and
non-secret error behavior.

- [ ] **Step 2: Run the focused server test**

Run `pnpm --dir server exec vitest run src/email/__tests__/resend-email.service.test.ts`.
Expected: FAIL because the service and module do not exist.

- [ ] **Step 3: Implement the service and module**

Use `fetch("https://api.resend.com/emails", ...)`, HTML-escape email content,
send a plain-text alternative, and return without a request when the key is
missing. Log only order ID/status on failed delivery.

- [ ] **Step 4: Add typed environment values**

Expose `resendApiKey` and `resendFromEmail`, with a development-safe default
sender of `Digital-E <onboarding@resend.dev>`. Add placeholder key/from values
to tracked templates only.

- [ ] **Step 5: Run the focused server test**

Run the same Vitest command and expect all service tests to pass.

### Task 4: Send email after immediate checkout for every customer

**Files:**
- Modify: `server/src/orders/orders.module.ts`
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/__tests__/guest-purchase.test.ts`

**Interfaces:**
- Consumes: the committed order transaction result, guest contact snapshot, or
  authenticated user record plus authoritative cart snapshot.
- Produces: one confirmation attempt after successful transaction commit.

- [ ] **Step 1: Write failing integration-at-service tests**

Inject mocked email and user repositories into the existing order service
fixture. Assert guest and authenticated emails use the created order ID,
authenticated email/name come from the server user record, and no raw token is
included. Add a test proving a rejected email promise does not reject the
purchase.

- [ ] **Step 2: Run the focused server tests**

Run `pnpm --dir server exec vitest run src/orders/__tests__/guest-purchase.test.ts`.
Expected: FAIL because the order service does not inject or call email delivery.

- [ ] **Step 3: Implement post-commit delivery**

Inject the optional `ResendEmailService` and `UsersRepository`, build one
generic email input from the authoritative transaction result, resolve
authenticated recipient identity from the database, then await delivery in a
catching boundary after `createOrderFromValidatedCart` returns.

- [ ] **Step 4: Register the email module**

Import `EmailModule` into `OrdersModule` and keep the email provider outside
controllers/repositories.

- [ ] **Step 5: Run the focused tests**

Run the authenticated/guest purchase and email service Vitest files; expect all
tests to pass.

### Task 5: Send email after Stripe finalization for every customer

**Files:**
- Modify: `server/src/orders/orders.service.ts`
- Modify: `server/src/orders/__tests__/orders.reservation-finalization.test.ts`
- Modify: `server/src/orders/__tests__/orders.stripe.service.test.ts`

**Interfaces:**
- Consumes: the pending checkout identity/contact/cart snapshot and the finalized
  order from `finalizeReservedCheckout`.
- Produces: one confirmation attempt only when a new order is finalized; no
  email on idempotent webhook reprocessing or before payment finalization.

- [ ] **Step 1: Write failing finalization tests**

Add guest and authenticated pending-checkout fixtures with mocked email/user
dependencies. Assert finalization sends once with the order data, authenticated
identity is server-resolved, guest hash/raw token is excluded, and an
already-consumed reservation sends no second email.

- [ ] **Step 2: Run the focused tests**

Run `pnpm --dir server exec vitest run src/orders/__tests__/orders.reservation-finalization.test.ts src/orders/__tests__/orders.stripe.service.test.ts`.
Expected: FAIL because finalization currently only sends the existing
authenticated in-app notification and does not send confirmation email.

- [ ] **Step 3: Implement guest finalization delivery**

Use the pending guest contact and cart JSON after the transaction returns. Keep
the existing authenticated notification behavior and guard duplicate paths.

- [ ] **Step 4: Run the focused tests**

Run the same command and expect all tests to pass.

### Task 6: Update docs and run verification

**Files:**
- Modify: `README.md`
- Modify: `docs/API.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/concepts/guest-checkout.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- Consumes: the implemented env and customer confirmation behavior.
- Produces: current developer and long-term knowledge documentation.

- [ ] **Step 1: Document Resend setup and customer behavior**

Document the two env variables, verified sender requirement, no-key local
behavior, valid-email filtering, post-commit timing, authenticated/guest links,
and the fact that confirmation email omits the raw guest access token.

- [ ] **Step 2: Run package verification**

Run:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client exec vitest run src/features/orders/pages/CheckoutSuccessPage.test.tsx
pnpm --dir client build
pnpm --dir client lint
pnpm --dir server typecheck
pnpm --dir server exec vitest run src/email/__tests__/resend-email.service.test.ts src/orders/__tests__/guest-purchase.test.ts src/orders/__tests__/orders.reservation-finalization.test.ts src/orders/__tests__/orders.stripe.service.test.ts
pnpm --dir server build
pnpm --dir server lint
git diff --check
```

- [ ] **Step 3: Review the final diff**

Confirm the Support theme files remain unstaged/unrelated, no `.env` or secret
is tracked, and the email payload never includes the guest token/hash.
