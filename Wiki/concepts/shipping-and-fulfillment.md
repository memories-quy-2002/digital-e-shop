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

The GHN provider and historical fulfillment paths are still present while the
approved internal-delivery rollout is in progress. New checkout quotes no
longer use GHN service or parcel data. The retirement task will remove active
carrier operations while preserving existing GHN shipment rows and events as
read-only history. See the [approved delivery design](../../docs/superpowers/specs/2026-10-16-internal-delivery-design.md)
for the full workflow and acceptance criteria.

Related: [[order]], [[payment]], [[durable-operations]],
[[transactional-email-operations]].
