# Transactional email operations

Business services enqueue immutable email-event snapshots inside the same MySQL
transaction as the account, order, payment, shipment, cancellation, or
after-sales change. New account creation queues a localized welcome email;
verified PayOS payment and COD collection at delivery queue one payment
confirmation per order. Shipment state changes, including DELIVERED, continue
to send shipment updates. Cancellation, after-sales decisions, and refund
confirmation also use this subsystem.

The durable runner sends messages after commit through a disabled, sandbox, or
Resend adapter. Message rendering escapes customer-supplied values and excludes
guest-order access tokens. Fixed event keys make registration, payment, and
provider callback retries idempotent.

Provider acceptance is not inbox delivery. Webhook events are authenticated
against their raw request body and deduplicated before updating delivery state.
Retries use bounded leases and idempotency keys. An ambiguous send is not
repeated beyond the provider-safe window; it moves to operator review. Admin
recovery is authenticated, audited, and limited to eligible events.

The runner endpoint is protected by a server-only secret. A hosted scheduler,
verified sender domain, Resend credentials, and EMAIL_PROVIDER_MODE=resend
must be provisioned separately. Local sandbox success is simulation evidence
only.

Related: [[durable-operations]], [[order]], [[after-sales-request]],
[[shipping-and-fulfillment]].
