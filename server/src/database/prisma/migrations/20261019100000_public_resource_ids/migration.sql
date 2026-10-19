-- UUID v7 public references. Internal primary/foreign keys remain unchanged.
-- MySQL 8.0.13+ expression defaults also cover old application instances and seeders.
-- Backfilled UUID timestamps indicate ID assignment time, not historical creation time.
-- DDL auto-commits; take a backup and allow for table rebuilds on large deployments.

ALTER TABLE orders ADD COLUMN public_id CHAR(36) NULL;
ALTER TABLE orders ALTER COLUMN public_id SET DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6)))));
UPDATE orders SET public_id = (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))) WHERE public_id IS NULL;
ALTER TABLE orders MODIFY COLUMN public_id CHAR(36) NOT NULL DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))),
    ADD UNIQUE KEY uq_orders_public_id (public_id);

ALTER TABLE support_tickets ADD COLUMN public_id CHAR(36) NULL;
ALTER TABLE support_tickets ALTER COLUMN public_id SET DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6)))));
UPDATE support_tickets SET public_id = (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))) WHERE public_id IS NULL;
ALTER TABLE support_tickets MODIFY COLUMN public_id CHAR(36) NOT NULL DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))),
    ADD UNIQUE KEY uq_support_tickets_public_id (public_id);

ALTER TABLE after_sales_requests ADD COLUMN public_id CHAR(36) NULL;
ALTER TABLE after_sales_requests ALTER COLUMN public_id SET DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6)))));
UPDATE after_sales_requests SET public_id = (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))) WHERE public_id IS NULL;
ALTER TABLE after_sales_requests MODIFY COLUMN public_id CHAR(36) NOT NULL DEFAULT (lower(concat(insert(lpad(hex(cast(unix_timestamp(current_timestamp(3)) * 1000 as unsigned)), 12, '0'), 9, 0, '-'), '-7', right(hex(random_bytes(2)), 3), '-', hex(8 + (ord(random_bytes(1)) & 3)), right(hex(random_bytes(2)), 3), '-', hex(random_bytes(6))))),
    ADD UNIQUE KEY uq_after_sales_requests_public_id (public_id);
