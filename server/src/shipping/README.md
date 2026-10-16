# Shipping and internal delivery

Checkout quotes use an operator-configured store pin and an OSRM-compatible
road route. Fees are free below 5 km, use the configured middle band from 5 to
20 km, and use the higher band above 20 km. Parcel dimensions do not participate
in quote creation.

New orders create an `INTERNAL` shipment in the same transaction as checkout.
Admins advance packing states, schedule an active delivery staff member, and
review assignment history. Staff updates their own assignment through the
employee-scoped routes; customers see the assignee, schedule and public status
events. The system never requests or records GPS.

Historical GHN shipment rows, event payloads, location codes and schema remain
available for read-only history. They do not trigger provider requests, new
shipment jobs, labels, callbacks or state changes. Retired shipment tasks fail
with `shipping_provider_retired`; new legacy shipment tasks are rejected.
