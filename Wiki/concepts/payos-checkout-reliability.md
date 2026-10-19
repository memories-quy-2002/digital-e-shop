---
contentType: Conceptual
goal: Explain the durable PayOS checkout-attempt flow and recovery boundary
audience: Maintainers, operators, and AI agents
contentPlan: Attempt ownership, verified payment facts, finalization, cancellation, and admin exceptions
openQuestions: Run configured PayOS sandbox acceptance after credentials and test channel are available
---

Back to [[index]]

# PayOS checkout reliability

Each PayOS checkout creates an owner-scoped `PaymentAttempt` before requesting
the provider link. Its provider order code, expected VND amount, and display
snapshot are immutable. An idempotency key replays the same attempt only for the
same checkout request.

The verified webhook inbox and server-to-server PayOS lookup feed normalized,
append-only observations. A browser redirect or query parameter only identifies
which attempt to resume; it never proves payment. A checkout is confirmed only
when `paymentState = PAID`, `orderState = CREATED`, and a committed `orderId`
are all present.

Authenticated customers read through owner-scoped routes. Guests use the
existing guest cart cookie in addition to the attempt ID. Cancellation records
intent before calling PayOS; if payment is later verified, its receipt remains
immutable and enters exception review. Reconciliation work uses the existing
durable operations runner with bounded retries.

In the local mock checkout, canceling first cancels the payment attempt and
returns to the cart while restoring the in-memory contact and delivery form
draft. The draft is not written to persistent browser storage, and the
single-use delivery quote is intentionally recalculated. A zero-payable order
cannot start a PayOS attempt; customers must choose COD.

Admins can inspect a sanitized checkout snapshot, retry an eligible paid
attempt, or record an offline transfer already completed. Retry requires an
exact paid amount and no order, cancellation intent, refund, or closed
resolution. Refund amounts are capped at verified unrefunded funds under a
row lock. Evidence remains private, and the refund route never calls PayOS or a
bank.

See [[payment]], [[durable-operations]], and the [API guide](../../docs/API.md).
Provider test acceptance still requires configured PayOS sandbox credentials
and an external test channel; the local mock is not provider evidence.
