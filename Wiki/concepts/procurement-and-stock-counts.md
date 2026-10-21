---
contentType: Concept
goal: Explain how procurement receiving and stock counts preserve inventory history
audience: Maintainers and AI agents
contentPlan: Revisions, reservation basis, source-linked movements, transactional approval
openQuestions: None for the one-warehouse P1 scope
---

Back to [[index]]

# Procurement and stock counts

## Stock revision

`products.stock_revision` is an unsigned monotonic revision. Every supported stock
writer increments it when quantity changes, including checkout deductions, order
restores, admin edits, receipts, approved counts, soft deletion and demo seeding.
A change followed by a reversal therefore still invalidates an earlier count.

## Counting basis

A stock count records unallocated warehouse units after placed-order deductions.
Pending checkout reservations are included in that physical on-hand quantity; the
UI shows active holds separately, and an approval cannot set stock below those
holds. Damaged/rejected receipt units never enter stock. This release has one
warehouse and does not implement location or allocation ledgers.

A count captures product stock and revision under ordered product locks. Draft
observations require a reason for differences. Approval rechecks every revision
and live reservation inside a transaction, then updates stock, source-linked
movements, product-alert transitions, actor audit and count state atomically. A
stale or reservation-short count returns conflict details instead of overwriting
stock. Reopening a submitted count refreshes and clears only selected lines.

## Source-linked inventory history

Receipt and count corrections create inventory movements linked to their immutable
source line. The source foreign keys are unique, and the database check prevents
one movement from claiming both document types. Existing order movements remain
compatible with null document-source fields. Acquisition costs exist only for
newly received units; legacy stock without a receipt has unknown cost.

See [[supplier-and-procurement]], [[product]], and [[order]].
