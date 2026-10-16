# Internal delivery design

Date: 2026-10-16  
Status: approved by the owner on 2026-10-16; implementation is underway.  
Related: [[shipping-and-fulfillment]], [[order]], and the current fulfillment
routes and quote flow.

## Outcome

Digital-E operates its own last-mile delivery. Admins assign an employee and a
delivery time window to an order. The assigned employee sees the order,
recipient, address, contact details and item list, then records delivery
progress and outcome. Customers see the assigned employee's name, the scheduled
window, status and status history.

No staff or customer GPS is collected, requested, transmitted or displayed.
There is no live location polling or tracking link. The map is an address and
distance tool: it displays the store and destination pins and the calculated
road route used for delivery pricing.

## Scope

Included:

- Replace GHN and the local GHN sandbox as active shipping/fulfillment
  integrations with Digital-E's internal delivery workflow.
- Let an admin configure the store address and map/routing settings, and set
  the two non-zero delivery price bands.
- Let a customer enter/select a delivery address, position its pin manually,
  preview the road distance and fee, and submit the bound quote at checkout.
- Let admins schedule, assign, reassign and reschedule delivery employees;
  inspect recipient/address, order contents, payment method and relevant COD
  amount; and review delivery events.
- Give each delivery employee access only to their assigned deliveries and the
  minimum customer/order information needed to complete them. Employees can
  record `OUT_FOR_DELIVERY`, `DELIVERED`, or `DELIVERY_FAILED` with a failure
  reason when applicable.
- Show customers the assigned employee, scheduled time window, current
  delivery status and event timeline, with owner/guest-token authorization.
- Keep existing GHN shipment records and events available as historical,
  read-only data. Do not call GHN or schedule new GHN work.
- Preserve existing payment, inventory, order completion, COD collection,
  loyalty and transactional-email rules when delivery is completed.

Excluded:

- Staff/customer GPS, background location permissions, live maps, route
  telemetry, automatic ETA updates and location history.
- GHN API calls, GHN webhook processing, new GHN labels or shipment creation.
- Multiple warehouses, multi-parcel fulfillment, route batching/optimization,
  proof-of-delivery photos, signatures, driver chat, and a driver mobile app.
- Automatic refund, replacement shipment or payment-provider changes.

## Delivery price and quote rules

The authoritative distance is the road-route distance in whole meters returned
by a configured OSRM-compatible routing service. It is the route between the
configured store pin and the customer-selected destination pin, not straight-line
distance. Fee bands are:

| Route distance | Fee |
| --- | --- |
| `< 5,000 m` | `0 VND` |
| `5,000 to 20,000 m`, inclusive | Admin-configured `x VND` |
| `> 20,000 m` | Admin-configured `y VND`, where `y > x` |

The admin delivery settings form validates non-negative whole-VND amounts and
requires `y > x`. It also validates the store coordinates and refuses to save
an unusable routing/map configuration. A missing/invalid route or routing
provider outage fails quote creation with a recoverable error; the server does
not substitute straight-line distance or a guessed fee. A missing required
configuration disables new delivery quotes with an actionable admin message.

The customer places the destination pin manually; the feature does not request
browser geolocation. The server computes the route and fee. A short-lived quote
is bound to the authenticated customer or guest identity, cart snapshot,
address text, destination coordinates, route distance, fee and delivery-setting
version. Checkout revalidates quote ownership, expiry, cart and address binding.
The consumed distance and fee are copied to the immutable order delivery
snapshot, so later address or price-setting changes do not reprice an existing
order or payment.

## Roles and authorization

Add a dedicated `DeliveryStaff` user role. Only admins can grant/revoke it and
manage delivery settings, assignments or schedules. Admin authorization is
checked before any settings or assignment business logic.

An employee can list/read only active assignments where their own user ID is
the assigned employee. They cannot browse the customer list, search arbitrary
orders, change payment data, change price/quote data, assign another employee,
or edit another employee's delivery. Status writes validate the legal state
transition and append an event; repeated identical updates are idempotent.

Customers see their own delivery projection only. Guest checkout uses the
existing token-protected order lookup boundary; delivery status must not create
a weaker guest lookup route. Customer responses exclude internal notes,
staff-only events and unrelated customer data.

## Scheduling and delivery lifecycle

An assignment contains the order, employee, local delivery date, start/end time
window, assigning admin, status, and timestamps. Interpret windows in
`Asia/Ho_Chi_Minh`. Reject an end time that is not after its start and prevent
overlapping active assignments for one employee. Admins may reassign or
reschedule before delivery; the prior assignment and actor remain in the audit
history.

Normal flow:

```text
UNASSIGNED -> ASSIGNED -> OUT_FOR_DELIVERY -> DELIVERED
                                  |
                                  +-> DELIVERY_FAILED -> ASSIGNED (new attempt)
```

Only the assigned employee may mark `OUT_FOR_DELIVERY`, `DELIVERED`, or
`DELIVERY_FAILED`. A failed delivery requires a reason and returns to admin
work for a later reassignment/reschedule. Delivered is terminal and is recorded
once. A delivered order cannot be silently reopened or assigned again. Admin
corrections require an explicit audited action if the existing lifecycle
supports one; ordinary updates cannot reverse delivery.

Each state change and assignment change is an append-only, timestamped event.
Delivery status is separate from the legacy numeric order status. Marking an
order delivered calls the existing transaction-aware order-completion path so
that inventory/payment guards, COD collection, loyalty and transactional email
remain consistent and happen at most once.

## Maps and external services

Use a configurable map tile URL with visible attribution; do not embed a
provider key or hard-code a demo tile host. The route service is configured
server-side with an OSRM-compatible endpoint; the browser never calls the
routing API directly. Treat provider/network failures as quote failures and
avoid logging precise customer coordinates. Persist coordinates only as needed
to price and fulfill that order, protect them with the same ownership boundary
as its address, and do not retain a movement/location trail.

The map renders two address pins and the route returned for the quote. It never
renders an employee position. Admin and customer delivery pages show address
and schedule/status data without a live map.

## GHN retirement and historical data

Remove GHN provider selection, credentials/configuration, quote/service lookup,
shipment creation/label calls, webhook routes/verification, retry tasks, and
client dependencies on GHN province/ward/service data from active runtime
paths. Replace current quote and fulfillment entry points with the internal
delivery contracts. Keep existing GHN database rows, migration history and
event payloads intact; expose them as read-only history so order history does
not disappear. Existing in-flight GHN shipments remain at their last recorded
status and are not automatically duplicated into an internal assignment.
Admins can review these historical records; no new GHN status is claimed after
integration removal.

Schema rollout is additive. New internal assignments, events, settings and
quote fields/tables are introduced without deleting or rewriting historical
shipment data. Keep the MySQL runtime repository and the partial Prisma schema
aligned. Do not run migrations against a production database as part of this
work.

## User experience and accessibility

Customer checkout and account/order pages, employee assignment pages, and the
admin delivery board use existing feature/API, shared HTTP, i18n and theme
boundaries. Support Vietnamese and English, light and dark themes, responsive
layouts, keyboard navigation and visible focus. All map actions have a
non-map address/form alternative; pin location can be adjusted without drag by
entering coordinates only if the UI exposes that safely, or by keyboard map
controls. Status, validation, unavailable-route, loading, empty and retry
states are explicit. Do not make a map the only way to set or read an address.

## Acceptance criteria

| ID | Required behavior |
| --- | --- |
| AC01 | No page or API requests staff/customer location permission, records GPS pings, or displays a live staff position. |
| AC02 | Map shows the configured store and manually selected customer destination, with visible attribution and an address alternative. |
| AC03 | Server route distance uses configured routing; `<5 km` is free, exactly `5 km` and exactly `20 km` use `x`, and any distance over `20 km` uses `y`; validation enforces `y > x`. |
| AC04 | Missing settings, no route, timeout or routing outage never produce a guessed price; customer can retry after recovery. |
| AC05 | Quote cannot be reused by another owner/guest, cart, address, coordinates or after expiry; order/payment retains the quoted fee and distance snapshot. |
| AC06 | Admin can create/change settings and assign/reschedule/reassign an eligible employee with a valid non-overlapping time window; actions are audited. |
| AC07 | Delivery staff can see only their assignments and required order details; direct/guessed IDs and cross-staff status updates are denied. |
| AC08 | Valid status transitions are enforced; failed attempts require a reason; duplicate writes do not duplicate events or side effects; delivered is terminal. |
| AC09 | Customer signed-in and guest-token flows show only authorized assignee, time window, status and public timeline; no internal notes or GPS. |
| AC10 | Delivered orders use the existing completion path exactly once, including COD and payment guards, inventory behavior, loyalty and transactional email. |
| AC11 | No active runtime path can quote through, create, label, retry or receive webhook updates from GHN; existing GHN records remain readable and unchanged. |
| AC12 | Client and server have focused tests for pricing boundaries, quote binding, authorization, schedule overlap, transitions, completion idempotency, and GHN-retirement compatibility. |
| AC13 | English/Vietnamese, both themes, mobile/desktop, keyboard operation, focus, screen-reader status updates, loading/error/empty states and map/address alternatives are verified. |

## Delivery evidence and remaining gates

Local acceptance uses unit tests plus isolated MySQL integration tests for
quote/assignment transactions and ownership. Run relevant client typecheck,
tests, build and lint; server typecheck, tests, build and lint; and browser checks
for desktop/mobile, both locales and themes. Do not start client or server dev
servers as part of automated verification.

External route-service and tile configuration must be available in each
deployment before delivery quotes are enabled. Verify required attribution,
cache behavior and provider usage limits against the configured services.
Real-world live routing acceptance is distinct from mocked unit evidence.
Record which environment/provider was exercised; do not claim live routing
verification if only a mock was used.
