# Marketing subscriptions

Back to [[index]]. See also [[authentication-and-email-verification]] and [[architecture]].

## Behavior

The footer calls `POST /api/marketing/subscribe` with a normalized customer
email and source. The server stores an `ACTIVE` row in
`marketing_subscriptions`, sends one Resend welcome email when delivery is
configured, and returns success even when the email provider is unavailable.
Submitting an already active address is idempotent and does not send another
welcome message. An address that previously unsubscribed can subscribe again
and receives a fresh one-time unsubscribe link.

The welcome message links to `/unsubscribe?token=...`. The database stores only
the SHA-256 token hash. The client consumes the token without rendering it and
the server clears it on successful unsubscribe, making the link one-time.

When the subscribed address matches a Digital-E account, the welcome email is
sent only after that account verifies its email. An unverified account can
still create or reactivate the `ACTIVE` subscription, but delivery is skipped
until a future subscription flow is triggered. A valid address with no matching
account is treated as an external marketing opt-in and can receive the welcome
message.

## Boundaries

- Marketing subscription is separate from transactional order and account-security email.
- A valid email is required; the public endpoint is rate-limited and CSRF-protected by the normal unsafe-request flow.
- Resend delivery is a side effect and never rolls back a committed subscription.
- Account email verification gates welcome delivery; verification and email-change confirmation remain separate account-ownership messages.
- The current implementation provides opt-in, welcome, and opt-out behavior; campaign scheduling and bulk audience delivery are intentionally outside this module.

## Code map

- Server module: `server/src/marketing/marketing.module.ts`
- Subscription service/repository: `server/src/marketing/marketing.service.ts` and `server/src/marketing/marketing.repository.ts`
- Delivery boundary: `server/src/email/resend-email.service.ts`
- Client API/footer: `client/src/features/marketing/api.ts` and `client/src/components/layout/Footer.tsx`
- Client opt-out page: `client/src/pages/UnsubscribePage.tsx`
- Schema/migration: `server/src/database/prisma/schema.prisma` and `server/src/database/prisma/migrations/20260910140000_account_security_and_marketing/`
