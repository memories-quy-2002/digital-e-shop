# ADR 0004: Guest cart and checkout access model

Back to [[index]]. Related: [[guest-checkout]], [[architecture]].

**Status:** Accepted
**Date:** 2026-09-08

## Decision

Unauthenticated shoppers may keep a local cart cache and complete checkout
without creating an account. The cache is best-effort synchronized to an
anonymous server cart identified by a random HttpOnly cookie UUID. The server
remains authoritative for catalog data, stock, reservations, promotion
validity, prices, and totals.

Guest order access uses a cryptographically random token returned once by an
immediate purchase or guest PayOS checkout creation. The database stores only
the SHA-256 hash. The active browser keeps the raw token in `sessionStorage`;
it is not placed in URLs, local cart storage, logs, or admin payloads. Lookup
requires both the order ID and token.

## Consequences

- Order and pending-checkout identities may have a null `user_id` plus a
  validated guest contact snapshot.
- Public preview, purchase, PayOS checkout, and lookup routes retain CSRF,
  validation, rate-limit, server revalidation, and transactional safeguards.
- Public success and lookup pages must not claim that a guest email was sent.
- Admin queries use left joins and show guest contact fields without exposing
  token material.
- Anonymous cart persistence stores only product IDs and quantities, expires
  after 30 days, and is exposed to Admin analytics only as aggregate funnel
  counts. It is not a guest identity or a substitute for customer history.
- Guest-to-account cart merge stays retryable and client-controlled; guest
  orders do not appear in authenticated customer history.

## Non-goals

This does not add guest account creation, email-based order recovery, or an
email delivery provider. Guest cart persistence is intentionally anonymous and
does not store contact details.

## Operational caution

Apply the additive guest-cart migration before using the endpoints. Do not
reset, seed, or migrate a production database as feature validation. Orders
remain auditable transactional records; canceled orders are excluded from
commercial metrics rather than being soft-deleted.

The current route surface is documented in [docs/API.md](../../docs/API.md):
guest preview/purchase/lookup and guest PayOS checkout operations are public
but remain validation-, CSRF-, rate-limit-, and transaction-protected.
