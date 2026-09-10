# ADR 0004: Guest cart and checkout access model

**Status:** Accepted
**Date:** 2026-09-08

## Decision

Unauthenticated shoppers may keep a browser-local cart and complete checkout
without creating an account. The server remains authoritative for catalog
data, stock, reservations, promotion validity, prices, and totals.

Guest order access uses a cryptographically random token returned once by an
immediate purchase or guest Stripe session creation. The database stores only
the SHA-256 hash. The active browser keeps the raw token in `sessionStorage`;
it is not placed in URLs, local cart storage, logs, or admin payloads. Lookup
requires both the order ID and token.

## Consequences

- Order and pending-checkout identities may have a null `user_id` plus a
  validated guest contact snapshot.
- Public preview, purchase, session, and lookup routes retain CSRF,
  validation, rate-limit, server revalidation, and transactional safeguards.
- Public success and lookup pages must not claim that a guest email was sent.
- Admin queries use left joins and show guest contact fields without exposing
  token material.
- Guest-to-account cart merge stays retryable and client-controlled; guest
  orders do not appear in authenticated customer history.

## Non-goals

This does not add guest account creation, email-based order recovery, an email
delivery provider, or a second persistent cart database.

## Operational caution

Apply the additive guest migration before using the endpoints. Do not reset,
seed, or migrate a production database as feature validation.
