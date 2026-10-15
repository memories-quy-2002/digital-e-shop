ALTER TABLE payment_attempts
    ADD COLUMN cancel_requested_at DATETIME(3) NULL AFTER retry_after_seconds,
    ADD COLUMN reconcile_requested_at DATETIME(3) NULL AFTER cancel_requested_at;
