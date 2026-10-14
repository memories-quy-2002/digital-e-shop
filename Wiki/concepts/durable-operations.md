# Durable operations

Operations side effects use a MySQL outbox. Business services enqueue within
their own `TransactionContext`; a rollback removes both business change and task.
Tasks have immutable payload hashes and unique kind/business keys. Reusing a key
with different facts fails explicitly.

Short transactions claim a bounded batch with `FOR UPDATE SKIP LOCKED` and random
60-second fencing tokens. A stale or expired worker cannot finish a reclaimed
task. No provider request runs inside the claim transaction. Eight attempts are
the maximum, with bounded backoff; ambiguous outcomes require review.

The bounded runner processes shipment and transactional-email tasks after
commit. Shipment creation uses stable order references and lookup before retry
when the provider outcome is ambiguous. Email delivery records immutable event
snapshots and stops ambiguous retries inside the provider idempotency window;
operators can move uncertain work to review and recover eligible failures.
Runner invocation requires a server-only secret. Persistence and a runnable
endpoint do not activate hosted scheduling; that remains deployment work.

Related: [[architecture]], [[payment]], [[order]], [[shipping-and-fulfillment]],
[[transactional-email-operations]].
