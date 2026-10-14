# Durable operations

Operations side effects use a MySQL outbox. Business services enqueue within
their own `TransactionContext`; a rollback removes both business change and task.
Tasks have immutable payload hashes and unique kind/business keys. Reusing a key
with different facts fails explicitly.

Short transactions claim a bounded batch with `FOR UPDATE SKIP LOCKED` and random
60-second fencing tokens. A stale or expired worker cannot finish a reclaimed
task. No provider request runs inside the claim transaction. Eight attempts are
the maximum, with bounded backoff; ambiguous outcomes require review.

The task persistence foundation does not itself activate a runner or scheduler.
Email and shipment processors must supply their separate recovery policies.

Related: [[architecture]], [[payment]], [[order]].
