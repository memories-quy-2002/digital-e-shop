# Shipping and fulfillment

New checkout quotes use internal delivery pricing. The server routes between
the configured store pin and the customer's manually selected address pin via
an operator-allowlisted OSRM-compatible endpoint. `< 5 km` is free, `5–20 km`
uses the configured middle band, and `> 20 km` uses the higher band.

A short-lived quote binds customer or guest-cart identity, cart facts, the
structured address and coordinates, route, fee, and delivery-settings version.
Checkout locks and consumes that quote once, rechecks its identity, address,
cart, expiry, and settings version, then copies the fee and route into the
order's immutable delivery snapshot. A missing route or unavailable
configuration fails checkout quote creation; the server does not estimate a
straight-line distance or guess a price.

Saved customer addresses may retain optional coordinates. A pin must include
both latitude and longitude and pass coordinate bounds. The feature does not
request, record, or display customer or employee GPS. The quote response
includes the fixed store pin and configured tile attribution so the customer
map can show both endpoints without a privileged settings read.

Checkout and saved-address maps fetch the same minimal configuration from a
public endpoint. It exposes the store pin and operator-allowlisted tile URL and
attribution only; fee bands and the routing endpoint remain server-side.

## Internal assignments

Only pending VND orders with an `INTERNAL` delivery snapshot, an `INTERNAL`
shipment in `READY_TO_SHIP`, and eligible payment can be assigned. COD may be
pending; PayOS must be genuinely paid and not simulated. Admin schedule input is
Vietnam local time and is stored as UTC. The server locks the order and staff
row in a stable order, rejects overlapping active schedules and duplicate
active order assignments, and records reassignment as a new attempt so prior
events remain auditable.

`DeliveryStaff` accounts are granted through the audited admin user-access
flow. Authentication rechecks that the account is active, role guards restrict
the employee routes, and repository queries include the authenticated employee
ID. Employees see only their assignments plus recipient, destination, item
snapshot, payment method and COD amount needed to deliver. They can move an
assignment from `ASSIGNED` to `OUT_FOR_DELIVERY`, then to `DELIVERED` or
`DELIVERY_FAILED`; failure requires a reason. Customer projections include the
assignee name, schedule, status and public events, but omit employee IDs,
internal failure reasons and event actor IDs.

The admin fulfillment screen keeps packing actions and adds an internal
assignment queue with order contents, recipient, COD amount, active staff,
schedule changes and prior assignment attempts. Delivery settings are managed
at `/admin/delivery/settings`; routing and tile choices come only from server
allowlists, while an admin sets the store pin and the two non-free fee bands.
Schedule inputs are Vietnam local time and are parsed to UTC by the server.
Active `DeliveryStaff` accounts use `/delivery/assignments` for their own queue
and status updates. Login routes them to that workspace; admin authorization
continues to admit only `Admin`.

Internal shipment rows are created with the order in the checkout transaction,
so newly placed orders immediately enter the packing workflow without a
background carrier task. Manual fulfillment transitions are restricted to
packing states and reject existing non-`INTERNAL` shipment rows.

On the first valid `DELIVERED` update, the service records COD collection,
completes the order through the shared payment guards, awards eligible loyalty
points and queues the payment-confirmation and delivery-status emails in the
same transaction. Assignment row locks and stable event keys make repeated
status requests no-ops. Internal completion requires the shipment to remain
`READY_TO_SHIP` and a matching delivered assignment; legacy carrier completion
still requires its shipment state to be verified as `DELIVERED`.

Admin routes are `GET/PUT /api/admin/delivery/settings`,
`GET /api/admin/delivery/assignable-orders`, `GET /api/admin/delivery/staff`,
`GET /api/admin/delivery/orders/:orderId`, and
`POST /api/admin/delivery/orders/:orderId/assignments`. Employee routes are
`GET /api/delivery/staff/assignments`,
`GET /api/delivery/staff/assignments/:id`, and
`POST /api/delivery/staff/assignments/:id/status`. Customer delivery data is
added to the existing owner-guarded and hashed guest-token shipment routes.

GHN provider selection, HTTP calls, webhooks, labels and new shipment jobs have
been retired. Historical GHN shipment rows, events, parcel metadata and saved
address location codes remain readable and unchanged; they cannot be updated
through the active fulfillment workflow. New quotes do not use carrier service
or parcel data. See the [approved delivery design](../../docs/superpowers/specs/2026-10-16-internal-delivery-design.md)
for the full workflow and acceptance criteria.

Related: [[order]], [[payment]], [[durable-operations]],
[[transactional-email-operations]].
