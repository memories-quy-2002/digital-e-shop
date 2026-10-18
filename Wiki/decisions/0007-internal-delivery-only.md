# Decision 0007: Internal delivery only

Back to [[index]].

**Date:** 2026-10-16

**Status:** Accepted by the owner

## Decision

Digital-E will fulfill new orders using its own delivery staff. GHN and other
third-party carrier integrations are not required for P0. Admins configure the
store pin and fee bands, customers choose their destination pin, and the server
prices the road route through an allowlisted routing service. Admins schedule
eligible delivery staff; assigned staff record delivery progress and outcome.

The system does not call carrier APIs, create carrier labels, receive carrier
webhooks, or rely on external shipment jobs. It does not request or store staff
or customer GPS. Existing GHN shipments and address codes remain readable as
historical data and cannot be advanced by the active internal-delivery flow.

COD collection is recorded by delivery staff and remittance to the shop is
confirmed separately with evidence. Internal delivery does not add a
third-party carrier fee.

## Consequences

- P0 has no GHN credential, staging, webhook, or carrier-account gate.
- Delivery quote availability still depends on valid internal settings and the
  configured routing/map services.
- Historical GHN data and migration structures remain intact for compatibility.
- Delivery assignment, staff authorization, schedule conflict, status history
  and exactly-once order completion remain part of P0 acceptance.

See [[shipping-and-fulfillment]] and the
[internal delivery design](../../docs/superpowers/specs/2026-10-16-internal-delivery-design.md).
