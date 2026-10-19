# Public resource identifiers

Back to [[index]]. Related: [[order-lifecycle-and-support]], [[after-sales-request]], [[api-response-contract]].

## Decision

`orders`, `support_tickets`, and `after_sales_requests` retain their auto-increment
primary keys and numeric foreign keys. Each adds an immutable application-owned
UUID v7 `public_id` with a unique index and a non-null constraint. Products,
Firebase user IDs, existing UUID entities, and internal detail/log tables retain
their current key strategies.

UUID v7 references reduce exposure of sequential resource IDs while preserving
numeric joins. They expose ID-generation time and do not grant access: existing
roles, ownership checks, guest capabilities, and OTP rules still apply.

## Compatibility contract

- Order and support responses add `public_id`; after-sales responses add `publicId`.
- Existing numeric `id` and relationship fields remain available during migration.
- Order detail/status/cancellation, shipping lookup, support update, and after-sales
  detail/status/manual-refund accept public UUID v7 or legacy positive safe integers.
- Guest order lookup/recovery, support creation, and after-sales order references
  accept UUID v7 as well as numeric IDs. Guest tokens remain in POST bodies.
- References are validated and bound as SQL parameters; only fixed `id` or
  `public_id` column names are selected. Internal mutations resolve numeric IDs.
- The client prefers public IDs where available and falls back for old responses
  and cached links. Numeric IDs have not been removed from the API, so this is
  not a guarantee that sequential identifiers are hidden from every response.

## Migration and operation

Migration `20261019100000_public_resource_ids` adds nullable columns, installs
MySQL expression defaults, backfills missing values, and then enforces non-null
uniqueness. Separating ADD COLUMN from SET DEFAULT avoids MySQL's unsafe-system-
function restriction when adding nondeterministic defaults to populated tables.

Runtime writes generate UUID v7 with Node's cryptographic random bytes. Database
defaults implement the same timestamp/version/variant layout for old application
instances, seeders, and direct inserts. No trigger or stored function is needed.
Backfilled timestamps identify assignment time rather than historical row creation.

Deploy the migration before serving the updated queries. Use the documented
backup and deployment procedure: MySQL DDL auto-commits and ALTER TABLE can
rebuild or lock large tables. Nondeterministic defaults require row or mixed
binary logging for replication consistency. Keep assigned public IDs when
rolling back application code.

The isolated migration test uses `PUBLIC_ID_MIGRATION_TEST_URL` with an explicit
local MySQL account allowed to create/drop randomly named test databases.

## Sources

- `server/src/shared/utils/public-id.ts`
- `server/src/database/prisma/migrations/20261019100000_public_resource_ids/migration.sql`
- [RFC 9562, UUID v7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7)
- [MySQL expression defaults](https://dev.mysql.com/doc/refman/8.0/en/data-type-defaults.html)
