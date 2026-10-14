# Retail P0 operations design

Date: 2026-10-14
Status: written design approved by the owner on 2026-10-14; implementation has not started.
Scope authorized: all three P0 capabilities, with sandbox-first acceptance.
Related: [roadmap and tracker](../../backlog/README.md),
[deferred P1](../../backlog/P1.md), [QA checklist](../../bmad/qa-checklist.md).

Implementation: [P0 task plan](../plans/2026-10-14-retail-p0-operations.md),
awaiting plan review and execution-method selection.

## Outcome and boundary

One electronics retailer can accept an order, price delivery, pack and ship it,
track delivery, distinguish COD collected from money remitted, record an actual
manual refund, and notify the customer without losing work during a restart.

All three P0 capabilities belong to this release. Initial operation uses one
warehouse, one parcel per order, GHN as the carrier and Resend as the email
provider. Multiple parcels, partial fulfillment, automated bank payouts,
reverse-logistics pickup and replacement shipping are outside this release.
Return-to-origin for an undelivered outbound parcel is included.

The owner has no provider accounts yet and selected sandbox-first delivery.
Provide deterministic local adapters plus real provider adapters. Local
simulation is never described as a GHN staging call, a delivered external email
or a bank transfer. Sandbox adapters are rejected in production.

## Confirmed current boundaries

- `orders` retains numeric status `0 Pending`, `1 Done`, `2 Canceled`.
- `orders.service.ts` coordinates order completion, inventory and payment;
  current COD completion can confirm customer payment on delivery.
- Guest lookup uses token hashes and POST bodies; tokens never enter logs/URLs.
- PayOS signatures, reservation finalization and payment reconciliation exist.
- `PaymentProviderService.refundPayment` rejects live refunds without an adapter.
- Dedicated after-sales eligibility, quantity guards and refund ledgers exist.
- Order notifications are currently in-app; no transactional email provider is
  configured. Firebase continues to own identity-related emails.
- Inventory is deducted/reserved by existing checkout paths. Shipment must not
  deduct the same inventory again.
- MySQL feature repositories own writes; Prisma migrations/schema stay aligned.
- The API can run on Vercel; detached promises and process timers cannot be the
  production guarantee for retries.

Historical documents that describe after-sales as absent are not the runtime
contract. Use current services, validators and maintained entity notes.

## Architecture decision

Extend the existing Nest modular application. Controllers parse/authorize;
services coordinate; repositories own parameterized SQL; pure policies own
pricing, transitions and refund allocation. Client features reuse the shared
HTTP client, existing guards, i18n and theme tokens.

Use narrow carrier and email provider interfaces because local sandbox and real
providers are both required. Reuse existing Axios/Node capabilities where
appropriate; introduce a dependency only when verified webhook handling needs
a maintained SDK. Do not adopt a new commerce framework.

A durable MySQL task/outbox boundary supports carrier operations and email.
Transactions insert jobs with the business change; an explicit bounded runner
claims them later. External HTTP never holds the order/payment transaction
open. Separate email retry policy from shipment recovery policy.

Alternative approaches considered: process-local timers lose work after restart;
a separate broker adds infrastructure not required for this single retailer.
The MySQL outbox is the selected proposed approach.

## P0-01: Order fulfillment and GHN

### Checkout and pricing

- Add structured delivery addresses and server-owned product parcel dimensions
  and weights. Validate delivery coverage, sender configuration and selected
  service before issuing a quote. Missing parcel data blocks delivery pricing
  with an actionable error instead of silently inventing weights.
- Quote IDs are random, expiring and bound to the owner/anonymous cart, cart
  contents, address, provider and authoritative fee. Recalculate merchandise
  and promotions before accepting a quote at checkout.
- Snapshot merchandise subtotal, merchandise discount, shipping fee and payable
  total on pending checkout/order. Use exact integer VND and a single rounding
  policy. Shipping is not discounted by merchandise percentage promotions.
- Guest/signed-in COD and PayOS paths use the same calculation. Provider amount,
  payment ledger and customer confirmation equal payable total. Retain existing
  response keys and add explicit breakdown fields.
- Maintain legacy `total_price - discount` semantics by storing merchandise
  subtotal plus shipping fee as `total_price` for new orders. Update bounded
  analytics projections where item sales and shipping revenue differ.
- Existing orders retain zero shipping fee and unchanged stored amounts;
  historical USD rows are not converted or processed as new VND shipments.
- Apply the delivery requirement to every write-path alias, including legacy
  checkout endpoints. Do not leave a caller able to bypass the required quote.

### Fulfillment lifecycle

Maintain a separate fulfillment state and append-only events. Normal flow:

`UNFULFILLED -> CONFIRMED -> PICKING -> PACKED -> READY_TO_SHIP -> SHIPPED -> DELIVERED`

`DELIVERY_FAILED` can proceed to a new delivery attempt or `RETURNING`, then
`RETURNED`. Unknown carrier events remain reviewable rather than becoming Done.
Canceled pre-shipment orders follow existing cancellation guards. Admin cannot
cancel an in-transit parcel and immediately return its stock to availability.
Returned stock requires explicit physical-receipt confirmation; inventory
restoration still uses the existing once-only order guard.

Successful delivery sets `delivered_at` once and completes the order through a
shared transaction-aware lifecycle operation. Preserve the simulated-PayOS and
unpaid-PayOS completion guards. COD customer collection may be confirmed on
delivery; carrier remittance is a distinct financial state. For orders with
shipments, legacy admin completion routes must enforce the delivery policy too.

### Provider reliability and access

- Use a stable client order reference for creation. Persist an operation key
  before calling GHN. On an ambiguous create timeout, look up that reference
  before retrying; unresolved cases require operator recovery.
- Authenticated carrier callbacks enter only their exact route. Configure a
  custom shared-secret header and constant-time validation; confirm ShopID and
  match a known shipment. Do not invent an undocumented GHN HMAC signature.
- Deduplicate persisted carrier events and enqueue bounded verification/work.
  Commit durable receipt before acknowledgment; persistence failure returns a
  retryable response. Stale events cannot reverse terminal delivery states.
- Query authenticated provider order data to recover missed callbacks or
  ambiguous state. Inconsistent status/amounts become operator exceptions.
- Shipping labels are obtained through the admin boundary; never expose tokens
  or blindly redirect to an arbitrary URL supplied by the client/provider.
- New customers see guest-safe shipment status, expected delivery information
  and timeline; signed-in customers remain owner-scoped.

## P0-02: COD settlement and manual refunds

Record expected COD, customer-collected amount, carrier fees, carrier-remitted
amount, dates, references and discrepancy status separately from payment status.
For prepaid PayOS, shipment COD is zero. Where the shop pays shipping, reconcile
gross COD minus actual carrier charges to expected net remittance. Customers see
their payment state, not internal carrier accounting or bank information.

Authenticated carrier events can report remittance, but do not silently resolve
an amount discrepancy. Admin settlement confirmation includes a unique transfer
reference and evidence; duplicate references cannot credit money twice.
Record actor, timestamp and previous/new values. Retain existing PayOS recovery.

Manual refund is an explicit operation that records an already executed payment
to the customer; it is not a fake automatic payment-provider response. The
operator supplies a reference, transfer date, reviewed reason and evidence
stored behind admin access. No public or customer endpoint can confirm it.

The server computes refundable item value from immutable paid snapshots,
allocating merchandise discount deterministically in integer VND. Repeated and
partial quantities cannot refund the same unit twice. Shipping remains
non-refundable under this proposed P0 policy; it is visible in the breakdown.
Total refunds never exceed actual collected payment. Reject evidence-free,
unpaid, currency-mismatched and conflicting operations.

Lock request, payment/refund balance and unique operation records in a short
transaction. Confirm refund, update cumulative payment state, append audit/event
and enqueue its email atomically. Existing automatic refund paths remain
fail-closed until a real supported provider adapter is separately supplied.
Refunding money alone does not mark damaged goods as saleable inventory.

## P0-03: Transactional email and durable recovery

Include order placement, fulfillment updates, cancellation and after-sales
decisions/refund confirmation. Send to the order's contact snapshot for both
guest and signed-in orders, with EN/VI templates and escaped customer text.
Keep Firebase verification/reset emails and marketing subscriptions unchanged.

Insert uniquely keyed email jobs in the same transaction as their triggering
business event. Sending happens after commit. Recipient/template/order facts
are immutable per attempt; never send raw guest capability tokens, bank details,
private operator notes or secrets. Guest receipts contain non-sensitive facts
and instructions for the existing protected lookup.

The runner claims a bounded batch with expiring leases and fencing tokens;
multiple instances cannot claim one attempt. Retry temporary/network/rate-limit
failures with bounded backoff and provider retry hints. Permanent failures and
exhausted attempts enter a reviewable state. Recover expired leases after crash.

Use a stable Resend idempotency key for each immutable logical message. Because
provider deduplication expires after 24 hours, stop blind retries of an ambiguous
send before that window ends; move it to review/reconciliation instead. Do not
claim exactly-once external delivery from a database lock alone. Explicit admin
resend creates an audited new attempt with a warning when outcome is unknown.

Delivery/bounce/failure webhooks require provider signature verification on the
raw body, event deduplication and message-ID matching. An API-accepted email is
not labeled delivered. Disabled provider configuration cannot appear as a
successful send; sandbox outcomes are explicitly tagged and locally viewable.

Provide an authorized admin drain/retry action and a standalone bounded runner
command for local/scheduler execution. Production uses a secret-authenticated
HTTP invocation with time/batch budgets or the same command on a persistent
runtime. No unauthenticated GET route performs financial or email work.

Automatic production cadence needs provisioned scheduling. Vercel Hobby is
daily-only; use an explicitly configured external scheduler or Vercel Pro for
minute-level processing. Do not add an unsupported schedule or deploy a paid
service implicitly. Local acceptance invokes the runner deterministically and
proves restart/retry behavior; hosted scheduling remains a deployment gate.

## Persistence and API surfaces

Add forward migrations and matching Prisma projections for:

- Product parcel metadata and order/pending-checkout pricing/address snapshots.
- Delivery quotes, shipments, shipment operations and shipment events.
- COD settlements/remittance evidence and manual refund operations/evidence.
- Durable tasks/email jobs, attempt leases and deduplicated provider events.

Use foreign keys aligned with existing tables, unique business-operation keys,
indexes for owner lookup/provider reference/due work, and bounded queries.
Backfill historical compatibility without inventing shipment or remittance facts.

Feature surfaces: server shipping module; existing orders/cart/payment and
after-sales boundaries; transactional-email module and narrow task runner.
Client checkout/order history/guest success and lookup plus admin fulfillment,
settlement/refund and message recovery screens. Do not rename existing routes.
Admin actions retain auth/role/CSRF protection; external webhook/scheduler routes
have separate exact authentication boundaries, not broad CSRF exemptions.

## Configuration and operational readiness

Document placeholder-only settings for carrier mode, GHN token/shop/webhook
secret, sender address, email mode/API key/from address/webhook secret,
scheduler secret, request timeouts and bounded runner limits. Validate explicit
allowlisted provider base URLs to prevent environment-driven SSRF.

Provider credentials and recipient/evidence data never appear in logs. Redact
diagnostics, mask recipient/account fields in admin lists, and keep evidence
files private. Public guest responses omit internal references and audit data.

Use local sandbox fixtures for success, failure, duplicate, out-of-order,
timeout, remittance mismatch and email retry. GHN staging/real Resend calls
require accounts/API keys; these are future verification, not assumed results.

## Acceptance and verification

| ID | Required evidence |
| --- | --- |
| A01 | Guest and signed-in COD/PayOS checkout include server-owned shipping; tampered, expired and foreign quote IDs fail |
| A02 | Payment-link and ledger amounts equal VND pricing snapshots, including discounts and shipping |
| A03 | Packing/shipping makes no second stock deduction; duplicate or ambiguous carrier creation does not make duplicate parcels |
| A04 | Callback authentication, ShopID checks, duplicate and stale events cannot forge delivery, money or ownership |
| A05 | Delivery sets the warranty/return start once; in-transit return does not restore stock before physical receipt |
| A06 | COD collection, remittance and fees remain distinct; duplicate references and amount discrepancies are handled explicitly |
| A07 | Refund evidence is mandatory; net item allocation, concurrency, replay and cumulative caps prevent over-refund |
| A08 | Business commit persists one email job; provider outage/crash does not lose it or roll back the order |
| A09 | Leases, retry limits, permanent failures and ambiguity beyond provider deduplication window are tested |
| A10 | Signed email callbacks distinguish accepted/delivered/bounced; operators can inspect and recover failed work |
| A11 | All new UI states work in EN/VI, light/dark, desktop/mobile and keyboard; errors/focus/status announcements are accessible |
| A12 | Historical orders/currencies, route aliases, auth, CSRF, PayOS reconciliation and existing after-sales tests remain compatible |

Run package-local typecheck, lint, Vitest and builds for both packages; isolated
MySQL migrations/integration tests and browser end-to-end scenarios. Use a local
sandbox demo for both customer identities, both payment choices and operational
failure recovery. Migrate/test against an existing seeded baseline, not only an
empty database. Update the tracker with actual commands and evidence.

Implement in dependency order: pricing/task schema; fulfillment; settlement and
refund; email/recovery; integrated UI and end-to-end verification. This is a
release decomposition, not an approved implementation plan.

Do not mark the entire release complete while any A01-A12 item lacks evidence.
Report sandbox code acceptance separately from provider/production readiness,
as requested by the owner. Deploying, moving real money and enabling hosted
schedules remain separate operational actions.

## References

- [GHN order creation](https://developer.ghn.vn/vi/docs/order/create)
- [GHN callbacks and custom headers](https://developer.ghn.vn/vi/docs/webhook/callback-order-status)
- [Resend sending API](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend delivery events](https://resend.com/docs/webhooks/event-types)
- [Vercel scheduler limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)
