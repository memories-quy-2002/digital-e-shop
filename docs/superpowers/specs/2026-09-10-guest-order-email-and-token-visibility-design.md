# Customer Order Email and Guest Token Visibility Design

## Context

Guest checkout currently returns a high-entropy order access token and renders
it as readable text on the checkout success page. The project now has a Resend
boundary for guest confirmations, but authenticated customers do not yet
receive the same confirmation email.

## Goals

- Mask the guest access token by default on the success page.
- Let the customer explicitly reveal or copy the token.
- Send a confirmation email to every customer email that is valid on the
  server after the order is successfully committed.
- Cover immediate guest/authenticated checkout and Stripe guest/authenticated
  checkout, including mock finalization and webhook finalization.
- Keep email delivery failures from rolling back or marking an already-created
  order as failed.

## Decisions

### Token UI

`CheckoutSuccessPage` keeps the existing read-only token field, but renders it
as a password-style input until the customer selects `Reveal token`. A separate
button copies the raw value and reports a short status. The token remains out
of URLs and is never included in the confirmation email.

### Resend integration

Keep a small injectable `ResendEmailService` under `server/src/email/` that
calls the Resend HTTP API with Node's built-in `fetch`. This avoids adding
another runtime dependency. The service reads `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` from the existing typed environment configuration. Missing
API configuration is a safe no-op for local development; invalid recipient
emails are skipped; configured delivery errors are logged without secrets and
do not fail the order request.

Each confirmation request uses a deterministic order-scoped `Idempotency-Key`
so a retry cannot create another Resend send for the same order within the
provider's idempotency window.

Tracked environment templates contain placeholders only. A local `.env` file
is never created or committed by this change.

### Order timing and email content

Immediate guest and authenticated orders send the email after the checkout
transaction commits. Stripe guest and authenticated orders send it only after
reservation finalization, so opening a Stripe checkout session alone never
produces a false confirmation. Authenticated recipients and names come from the
server's user record, never from client-provided identity fields.

The email contains the order ID, order status, payment method, total, item
summary, shipping destination, and a link to the relevant order page. Guest
messages explain the Order ID/access-token lookup; authenticated messages link
to the signed-in order history. It does not contain the raw guest access token
because the token is the order's bearer credential and is intentionally kept
out of server persistence and third-party metadata.

Email delivery is awaited after commit and caught at the service boundary. A
Resend outage can delay the response or webhook acknowledgement, but it cannot
undo a committed order or cause duplicate order creation.

## Non-goals

- No email retry queue, delivery database, unsubscribe system, or template
  editor.
- No schema change for storing a raw or reversible guest token.

## Verification

- Client tests prove the token starts masked, reveal toggles the input, and
  copying calls the clipboard with the raw token.
- Server tests prove Resend request construction, missing-key/invalid-email
  no-op behavior, guest and authenticated immediate confirmation, Stripe
  finalization confirmation, and safe handling of email failures.
- Run client typecheck, focused client tests, server typecheck, focused server
  tests, builds, lint, and `git diff --check`.
