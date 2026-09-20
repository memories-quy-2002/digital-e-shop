# After-sales Workflow Design

**Date:** 2026-09-20  
**Status:** Approved for implementation planning  
**Scope:** Customer and guest returns/warranty requests, admin review, and auditable refund confirmation.

## Goal

Give Digital-E a privacy-safe, auditable after-sales workflow for delivered orders without bypassing the existing customer ownership, guest order-token, payment-ledger, CSRF, and admin-role boundaries.

## Current boundary

The existing support ticket workflow accepts authenticated customer tickets and can reference an order, but it does not enforce the seven-day return window, warranty eligibility, requested quantities, or a dedicated after-sales state machine. The payment layer already records order-payment status and refund metadata, while live refunds intentionally fail closed when a provider refund is not configured.

Relevant existing contracts:

- Customer order ownership is enforced by the authenticated order routes.
- Guest order access uses the one-time raw guest order token and stores only its hash.
- An order is delivered when `orders.status = 1` and `orders.delivered_at` is set.
- Canceled orders use `orders.status = 2` and must not enter after-sales processing.
- Order items retain product, price, warranty, and quantity snapshots.
- `order_payments` is the payment ledger; manual refund confirmation must remain auditable.
- The primary runtime persistence boundary is MySQL feature repositories; Prisma schema and migrations must remain aligned but are not a reason to rewrite existing repositories.

## Recommended architecture

Create a dedicated `after-sales` backend module instead of extending `support_tickets`. Support tickets remain the general customer-support inbox; after-sales requests become structured business records with explicit eligibility and transitions.

### Persistence

Add three tables through an additive MySQL migration and matching Prisma models:

1. `after_sales_requests`
   - `id`, `order_id`, nullable `user_id`, nullable `guest_order_token_hash`
   - `kind`: `RETURN` or `WARRANTY`
   - `status`: `REQUESTED`, `APPROVED`, `REJECTED`, `RECEIVED`, `REFUND_PENDING`, `REFUNDED`, `CLOSED`
   - `reason`, `admin_note`, `refund_amount`, `refund_currency`, `refund_reference`
   - `created_at`, `updated_at`, `approved_at`, `received_at`, `refunded_at`, `closed_at`
   - unique/idempotency key for the request creation attempt

2. `after_sales_items`
   - `request_id`, `order_item_id`, `quantity`, `reason`
   - unique `(request_id, order_item_id)` and a foreign-key relationship to the request and order item

3. `after_sales_events`
   - `request_id`, `from_status`, `to_status`, `actor_user_id`, `note`, `created_at`
   - append-only audit records for every state transition and refund confirmation

The request stores the guest token hash only as a capability reference. No raw guest token is stored, returned in admin responses, or placed in a public URL.

### Eligibility and state machine

The service, not the client, owns all checks:

- The order must exist, be delivered, have `delivered_at`, and not be canceled.
- `RETURN` is eligible until seven UTC calendar days after `delivered_at`.
- `WARRANTY` is eligible while the selected order-item warranty snapshot remains active; a null or zero warranty snapshot is not eligible.
- Requested quantity must be a positive integer and must not exceed the purchased quantity minus quantities in non-rejected/non-closed requests.
- An order item can be requested only once per active request; duplicate submissions use the idempotency key and return the existing request.
- Customer requests may start only at `REQUESTED`.
- Admin transitions are explicit and validated; illegal transitions return `409` with a meaningful message.
- Refund is an admin-confirmed terminal operation. It must use the payment ledger, be idempotent, and never mark a live provider refund as successful when the provider is unconfigured.

The first release does not create automatic replacement orders, shipping labels, carrier integrations, file uploads, email delivery, or live PayOS refunds. Those remain separate integrations with their own contracts.

### API boundaries

Customer routes under `/api/after-sales`:

- `POST /requests` creates a customer request after authenticated ownership and eligibility checks.
- `GET /requests` lists only the authenticated customer’s requests with pagination.
- `GET /requests/:id` returns only the authenticated customer’s request and guest-safe order/item snapshots.

Guest routes under `/api/orders/guest/after-sales`:

- `POST /requests` creates a request using `orderId` and the guest order token.
- `GET /requests` lists requests for the verified guest order using the same token capability.
- `GET /requests/:id` returns only guest-safe fields after verifying the request belongs to the token-authorized order.

Admin routes under `/api/admin/after-sales`:

- `GET /requests` lists paginated requests with status/kind filters.
- `GET /requests/:id` returns the operational detail, including order/payment context that an admin is authorized to see.
- `PATCH /requests/:id/status` applies a validated state transition and writes an audit event.
- `POST /requests/:id/refund` records a manual or mock refund confirmation with an idempotency key and reference.

Unsafe routes preserve the existing CSRF mechanism. Guest routes are rate-limited and must not weaken the existing public-route exception list beyond the established guest order contract.

### Client behavior

- Customer order detail exposes an after-sales action only when the server says the item is eligible.
- Customer account receives a paginated after-sales list and request detail/status timeline.
- Guest order lookup exposes the same request action without exposing customer account data.
- Admin receives a paginated after-sales queue and detail/status/refund controls.
- Loading, empty, validation, conflict, and server-error states are explicit and use the existing toast/status patterns.

## Security and privacy

- Customer APIs enforce authenticated ownership in the repository query and service boundary.
- Guest APIs verify the guest order token hash in the same transaction as request lookup/create and return only guest-safe fields.
- Admin APIs require `AuthGuard` and `RolesGuard` with the admin role before service logic.
- All request bodies use Zod validation; IDs, quantities, status values, and money values are server-validated.
- SQL remains parameterized; no raw token, cookie, payment secret, or personal data is logged.
- Refund amount is derived from server-side order-item snapshots and payment state, never trusted from the client.

## Testing and verification

Server tests must cover:

- customer ownership and cross-customer denial;
- guest token success, wrong-token denial, and guest-safe response shape;
- delivered/canceled/missing-delivery eligibility;
- seven-day return boundary and warranty-month boundary;
- quantity over-request and duplicate active request rejection;
- legal and illegal state transitions;
- admin role enforcement;
- refund idempotency, mock refund success, and live-unconfigured fail-closed behavior;
- pagination and filtered admin/customer lists.

Client tests must cover request payload mapping, eligibility-driven action visibility, state/error rendering, and pagination controls. The full package typecheck, lint, unit tests, builds, and the disposable MySQL integration path remain required before completion.

## Branch protection outcome

After the feature PR is created and the exact check names are confirmed, protect `main` with:

- pull request required;
- one approving review;
- stale reviews dismissed and last-push approval required;
- required CI client, CI server, dependency review, and active CodeQL checks;
- conversation resolution and linear history required;
- force pushes and branch deletion disabled;
- production migration kept behind the protected `production` Environment.

The branch-protection mutation is external repository configuration and will be verified by reading the resulting GitHub protection response after the update.

## Deliberate non-goals

- Replacing the existing support-ticket module.
- Rewriting all MySQL repositories to Prisma.
- Adding live PayOS refund calls before provider credentials and provider semantics are explicitly configured.
- Treating a client-provided amount, order status, or warranty duration as authoritative.
- Allowing guests to browse another order or retrieve a raw token through an after-sales response.
