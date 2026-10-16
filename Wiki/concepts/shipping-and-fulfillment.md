# Shipping and fulfillment

New checkouts require a server-calculated, short-lived delivery quote. The
quote binds the authenticated or guest identity, cart, structured Vietnamese
address, selected carrier service, parcel estimate, and whole-VND price
snapshot. Checkout consumes it once and rejects identity, cart, price, address,
or expiry changes.

Customer address-book entries can retain nullable GHN province and ward codes
and display names. Checkout preselects those locations for a quote; older or
free-form addresses continue to work after the customer selects valid carrier
locations.

GHN integration and the local sandbox share a provider boundary. Shipment
creation is a durable post-commit task with a stable order reference; ambiguous
creation outcomes are looked up before another create request. Carrier
callbacks update fulfillment events only after their configured authentication
is verified. Sandbox outcomes are local simulation, never provider proof.

Fulfillment is stored separately from the legacy numeric order status. Delivery
snapshots preserve carrier/tracking details and timeline history. COD expected
collection is recorded at delivery; remittance and fee differences are
reconciled separately. Physical returns and stock restoration require the
explicit return lifecycle rather than a legacy terminal order status.

Related: [[order]], [[payment]], [[durable-operations]],
[[transactional-email-operations]].
