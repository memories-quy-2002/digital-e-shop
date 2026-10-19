# Admin operations

Digital-E admin lists use bounded server-side filters and pagination so product,
order, and account growth does not require downloading full histories into the
browser. Dashboard analytics aggregate order-item data in MySQL and load on
initial view, range change, or manual refresh. Its periodic refresh reads only
the alerts and a five-order pending queue; the queue query uses a status/date
index and skips the global order summary and payment joins.

Stock adjustments, account access changes, and promotion changes write an
`admin_audit_events` row in the same database transaction as the business
update. The audit page provides bounded search by actor, action, record, and
reason. Audit metadata contains operational fields only; user access snapshots
include role and status, not customer profile data.

Product stock reductions also respect pending checkout reservations: the Admin
cannot set physical stock below the total quantity held by unexpired pending
checkouts. Product creation and product-editor stock movement records use the
authenticated admin ID as the actor so the inventory history can identify who
made the change.

Alert read state is scoped to the current admin. Alert ownership and resolution
are shared: an admin claims an open alert, may release their own claim, and
must own a claim to resolve it. Any admin can reopen a resolved alert. Active
conditions remain the source of alerts, so a disappeared order or inventory
condition is not retained as a stale operational queue item. Inventory and
support alert IDs include the source record's update timestamp; suspended-user
alerts include the latest access-change event ID. A later incident therefore
does not reuse an earlier read or resolution state.

The schema is introduced by the additive
`20261016120000_admin_operations_state` Prisma migration. Apply it before
deploying code that reads or writes audit, alert acknowledgement, or alert
triage state. The pending dashboard queue also needs the additive
`20261016130000_admin_pending_order_queue_index` migration. Runtime repositories
continue to use MySQL directly.
