# Stripe card payment — design

**Date:** 2026-07-07
**Status:** Approved by user, pending implementation.

## Goal

Add a real "Card" payment option to checkout, backed by Stripe Checkout (hosted), alongside the existing `bank_transfer` and `cash` methods. Demonstrates a real payment-gateway integration with webhook-driven reconciliation.

## Non-goals (explicit v1 scope boundary)

- No refund UI or Stripe refund API calls (not even for the oversell edge case below — see "Known limitation").
- No itemized Stripe receipts — a single line item for the final payable total is used instead (see "Trade-offs").
- No support for delayed/async Stripe payment methods — card only.
- No automated cleanup/expiry job for abandoned checkouts — not needed, see architecture.

## Architecture

Card payments get their own path that never touches the existing `makePurchase` bank_transfer/cash flow, and that flow's contract, validator, and endpoint are unchanged.

The order row — and the stock decrement — is only ever written once Stripe confirms payment, inside a webhook handler. Before that, a new `pending_checkouts` table holds the validated cart snapshot between "Checkout Session created" and "payment confirmed."

This means an abandoned or cancelled Stripe Checkout leaves no order and no stock reservation behind — nothing to clean up.

## Data model changes

New table `pending_checkouts`:

| column | type | notes |
|---|---|---|
| id | int PK auto_increment | |
| stripe_session_id | varchar(255) unique | Stripe Checkout Session id |
| user_id | varchar(255) | FK-equivalent to users.id, matches orders.user_id style |
| cart_json | text | JSON-serialized authoritative cart (post `validateCheckoutSubmission`) |
| total_price | decimal(11,2) | authoritative total before discount |
| discount | decimal(11,2) | |
| shipping_address | text | |
| created_at | datetime default current_timestamp | |
| consumed_at | datetime nullable | set when webhook creates the order; guards idempotency |

`orders` table: add two nullable columns, `stripe_checkout_session_id varchar(255)`, `stripe_payment_intent_id varchar(255)`. `payment_method` is already a plain `varchar(32)` (not a DB enum), so no migration risk adding the value `'card'` — but the existing `purchaseSchema` Zod enum (`server/src/modules/orders/orders.validator.ts:23`) and the controller whitelist (`server/src/modules/orders/orders.controller.ts:161`) both stay `["bank_transfer", "cash"]` unchanged, since card orders never go through `/purchase/:uid`.

Prisma's `Order` model (`server/src/database/prisma/schema.prisma:106`) gets the same two fields added for consistency with the raw-SQL schema, even though the orders repository itself keeps using raw MySQL.

## Backend flow

### 1. `POST /api/orders/checkout-session/:uid` (new)

- Middleware: `requireAuth`, `requireOwnerOrAdmin("uid")`, same rate limiter tier as `/purchase/:uid`.
- Payload: same shape as `purchaseSchema` minus `paymentMethod` (cart, totalPrice, discount, shippingAddress).
- Runs `cartService.validateCheckoutSubmission` — the same function `makePurchase` uses today. On stock/price mismatch, returns the identical 409 payload shape (`issues`, `authoritativeCart`, `authoritativeTotalPrice`) so the frontend's existing error-handling path in `CheckoutPaymentPage.tsx` needs no changes for this case.
- On success: creates a Stripe Checkout Session (`mode: "payment"`, one line item for `authoritativeTotalPrice - discount` — see trade-off below, `success_url: {CLIENT_URL}/checkout-success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url` back to the checkout page), inserts a `pending_checkouts` row keyed by the returned session id, and responds `{ url }`.

### 2. Frontend redirect

No Stripe.js/Elements needed — `window.location.href = url` sends the browser to Stripe's hosted page directly.

### 3. `POST /api/orders/webhooks/stripe` (new)

- Registered directly in `server/src/app.ts`, **before** `app.use(express.json())` and before `app.use(csrfProtection)` (both at lines 93/105 today), using `express.raw({ type: "application/json" })` for this exact path only. Because this route's own handler sends the response, the request never reaches the global JSON parser or CSRF middleware — so **no change to the CSRF skip-list is needed** (AGENTS.md flags broadening CSRF exceptions as sensitive; this design avoids touching it at all).
- Verifies the signature via `stripe.webhooks.constructEvent(rawBody, signature, env.stripeWebhookSecret)`.
- Handles `checkout.session.completed`. Looks up `pending_checkouts` by `stripe_session_id`.
  - If `consumed_at` is already set: return 200 immediately (idempotency against Stripe's at-least-once webhook retries).
  - Otherwise: runs the same stock-locking/order-insert transaction logic as `makePurchase` (extracted into a shared internal function `createOrderFromValidatedCart` used by both `makePurchase` and the webhook handler), with `payment_method = 'card'` and the Stripe session/payment-intent ids attached. Marks `consumed_at`.
- Runs the same post-commit side effects as `makePurchase` today: timeline event, notification, inventory movement recording.

**Known limitation (accepted for v1):** if stock sells out between session creation and the webhook firing, payment has already been captured by Stripe. Since refunds are out of scope for v1, the order is still created (rare oversell) and the existing notification/timeline services flag it for manual review. No Stripe refund API call is made anywhere in this feature — that boundary stays absolute for v1, resolved manually via the Stripe Dashboard if it ever happens.

### 4. `GET /api/orders/by-session/:sessionId` (new)

- `requireAuth`, ownership check against the session's associated user (defense in depth; session ids are unguessable Stripe-generated strings).
- Returns the order once the webhook has created it, or 404 while still pending. Used by the success page to poll.

## Frontend changes

- `client/src/features/orders/components/CheckoutPaymentPage.tsx`: add `"card"` as a third entry in `paymentOptions` (alongside `bank_transfer`, `cash`). Selecting it and submitting calls the new checkout-session endpoint instead of `/purchase/:uid`, then redirects via `window.location.href`.
- Checkout success page: currently reads `location.state.checkoutSuccess` from client-side navigation only. Add a branch — if the URL has `?session_id=...` (Stripe's hard redirect, no router state present), poll `GET /api/orders/by-session/:sessionId` every ~1.5s for up to ~10s until the order appears, then render the existing success UI with the returned order data. On timeout, show "Payment received — we're finalizing your order" rather than an error, since the customer has genuinely been charged even if the webhook is slow.

## Trade-offs

- **Single line item instead of itemized cart on the Stripe Checkout page.** Stripe Checkout doesn't support arbitrary negative-amount line items for discounts without also creating a Stripe Coupon object. A single line item for the final payable total keeps the charged amount correct without extra Stripe-side objects, at the cost of the customer's Stripe receipt saying "Digital-E order" instead of itemizing products.
- **No live end-to-end test during implementation.** Implementation targets documented env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`); Stripe test-mode keys were not available at design time, so a real test-mode checkout must be exercised by the user afterward using the setup steps below.

## Security notes

- No card data ever reaches this server — Stripe hosts the payment page. No PCI scope taken on.
- Webhook authenticity relies entirely on Stripe's signature, not network trust or IP allowlisting.
- `by-session/:sessionId` enforces ownership even though session ids are effectively unguessable.

## Environment variables (new)

```env
STRIPE_SECRET_KEY=<stripe-test-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret>
```

Added to `server/src/config/env.config.ts` following the existing pattern (plain `process.env.X || ""` reads).

## Local webhook testing setup

1. Install the Stripe CLI.
2. `stripe login`
3. `stripe listen --forward-to localhost:4000/api/orders/webhooks/stripe`
4. Copy the printed webhook signing secret into `STRIPE_WEBHOOK_SECRET` in `.env`.
5. Trigger a test checkout from the storefront using Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

## Testing plan

- Backend unit tests (Vitest, following the pattern established in the existing cart/inventory suite): the shared `createOrderFromValidatedCart` helper, and webhook idempotency (duplicate `checkout.session.completed` event for an already-consumed session must not create a second order).
- Manual: local Stripe CLI webhook forwarding + test-mode checkout, run by the user after implementation (API keys not available during implementation).

## Wiki / decision record

After implementation, append a decision entry to `Wiki/decisions/` (new file, e.g. `0002-stripe-webhook-driven-order-creation.md`) capturing the "order only exists after payment confirms" choice and its trade-offs, and update `Wiki/architecture.md` + `Wiki/index.md` per the standard wiki-maintenance rule, since this changes both the API contract and core checkout business logic.
