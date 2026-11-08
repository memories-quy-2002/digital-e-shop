# Storefront journey upgrades

Implement each slice independently. Preserve server authority over stock, money,
shipping and payment. Keep guest capabilities and customer ownership checks.

| Slice | Implementation | Acceptance evidence |
| --- | --- | --- |
| Checkout recovery | Update `CheckoutPaymentPage` and the delivery form to keep contact/address/pin while invalidating expired or rejected quotes. Explain price and item changes and distinguish merchandise totals from payable totals. | Expire a quote, change stock and price, and retry with the original address in a disposable local environment. |
| Payment and tracking | Reuse persisted payment attempt status and guest lookup in the checkout return flow. Separate pending, paid and failed states and show a recovery action for each. | Reload pending/paid/failed return states, including a guest whose browser lost the original checkout state. Verify no provider redirect is treated as payment proof. |
| Search | Update server catalog matching and ranking; retain the current search API. In the storefront, preserve query and offer per-filter removal on empty results. | Verify exact SKU/model priority, spaced model aliases and Vietnamese with/without accents alongside existing filter combinations. |
| Product detail | Keep price, availability, decisive specifications and purchase controls close together. Add a mobile purchase affordance that shares the existing add handler and pending/stock rules. | Browser coverage for mobile scrolling, add success and failure, and out-of-stock behavior. |
| Comparison | Keep the existing stored selection and differences toggle. Prioritize decisive attributes by category while retaining other rows. | Navigate back to catalog and return, compare rows with missing attributes, and check category order on mobile. |
| Compatibility | Start with explicit CPU/motherboard socket and RAM/motherboard standard rules using catalog attributes. Render compatible, conflict, and insufficient evidence with the fields behind each result. | Verify matching, mismatching, and missing attributes. Keep compatibility advisory and separate from cart validation. |
| Measurement | Record search no-results and checkout block/recovery outcomes using bounded reasons and the existing analytics boundary. Exclude raw queries, addresses and payment identifiers from new telemetry. | Verify denominators, deduplication and recovery attribution with synthetic events. |

Update the storefront journey guide and Wiki with delivered behavior. Run focused
checks and browser review in English and Vietnamese. Record fixture, local API,
and provider evidence separately.
