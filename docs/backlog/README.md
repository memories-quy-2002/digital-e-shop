# Retail operations roadmap

Last updated: 2026-10-14

Digital-E targets one electronics retailer. The requested release contains all
three P0 capabilities; P1 remains deferred until P0 is accepted.

- [P0 written design](../superpowers/specs/2026-10-14-retail-p0-operations-design.md)
- [P0 implementation plan](../superpowers/plans/2026-10-14-retail-p0-operations.md)
- [Deferred P1 backlog](./P1.md)

## P0 acceptance tracker

The owner selected sandbox-first acceptance because GHN and transactional-email
accounts are not available yet. Local sandbox evidence must be identified as
local simulation, not as a successful provider staging or production test.

| ID | Capability | Implementation | Acceptance evidence |
| --- | --- | --- | --- |
| P0-01 | Order fulfillment and carrier integration | Implemented; local sandbox | Shipping/fulfillment unit and isolated-MySQL tests; `client test:e2e` covers guest quote and COD checkout across 8 browser variants; provider staging is pending |
| P0-02 | COD settlement and evidence-backed manual refunds | Implemented; local sandbox | COD/refund allocation and isolated-MySQL tests; private evidence checks; retail P0 sandbox integration suite |
| P0-03 | Transactional email, durable retries and operator recovery | Implemented; local sandbox | Durable task and email policy tests; injected accepted/failure fixtures, retry/recovery and transaction-hook integration tests |

## Completion rules

- Every P0 feature has backend persistence, validation, authorization, operator
  UI, customer/guest behavior where relevant, migrations, and regression tests.
- Guest and signed-in checkout work with server-calculated shipping and exact
  VND totals for COD and PayOS; existing API aliases and security remain intact.
- A local sandbox demonstrates placement, packing, shipment, delivery, COD
  remittance, after-sales refund, email failure, retry, and operator recovery.
- Concurrency and duplicate-event tests prove that inventory, payment/refund
  balances, shipments, and notification jobs remain consistent.
- Relevant client/server checks and isolated MySQL integration tests pass;
  browser evidence includes English/Vietnamese, both themes, mobile/desktop,
  and keyboard operation.
- Maintained API/environment guides and Wiki reflect the implemented behavior.
- Provider staging/live verification remains explicitly pending until accounts,
  verified sender/domain, secrets and scheduler infrastructure are provisioned.

The local implementation and sandbox acceptance are complete. The sandbox is
simulation evidence only. GHN/Resend staging, live payment and transfer
reconciliation, and external scheduler provisioning remain pending until
accounts, verified sender/domain, secrets and scheduler infrastructure are
provisioned and tested.
