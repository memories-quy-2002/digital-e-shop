---
contentType: Entity
goal: Explain supplier and procurement snapshots
audience: Maintainers and AI agents
contentPlan: Supplier identity, purchase-order state, receipt quantities and costs
openQuestions: None for the one-warehouse P1 scope
---

Back to [[index]]

# Suppliers and procurement

Suppliers are admin-managed contact records. Archiving blocks new purchase orders
but preserves links from historical orders. A normalized uppercase supplier code
is unique. Edits and archival use document versions and append audit events.

Purchase orders begin as editable drafts. Confirmation locks and snapshots the
supplier code/name and each product SKU/name, so later catalog edits do not rewrite
history. Confirmed lines are immutable. Orders accept partial receipts; rejected
and missing units remain outstanding until a later receipt or an audited close.

Each receipt stores expected, accepted, rejected and missing quantities, planned
and actual whole-VND unit costs, actor and notes. A per-order idempotency key and
payload hash make a retry return the original receipt without adding stock again.
Accepted quantities, stock revision, source-linked movement, product-alert
transitions, order progress and audit entry commit together.

See [[procurement-and-stock-counts]] for the count basis and stock-safety rules.
