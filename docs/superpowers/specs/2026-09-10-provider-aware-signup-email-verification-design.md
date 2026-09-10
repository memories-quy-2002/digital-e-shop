# Provider-Aware Signup and Email Verification Design

**Date:** 2026-09-10

## Goal

Make account creation match the configured authentication provider in local and
production environments, add server-owned email verification through the
existing Resend integration, and allow unverified customers to sign in with a
limited session.

## Current problem

Development resolves to local authentication by default, and local login
checks the MySQL password hash. The Signup page nevertheless always creates a
Firebase account and the server stores a random placeholder password for that
Firebase identity. A newly created account can therefore appear successful but
cannot later use the local email/password login path. The current verification
button also calls Firebase directly from the browser, so it is not usable for
local-auth sessions.

## Chosen approach

Keep both providers, but make the registration contract provider-aware:

- Local registration accepts `username`, `email`, and `password`; the server
  generates the user id, hashes the password, and creates a Customer account.
- Firebase registration continues to accept a verified Firebase ID token and a
  username; the server remains the source of truth for the local account row
  and role.
- Both providers create an unverified account and issue the normal server
  session. Firebase's `email_verified` claim can mark an already verified
  provider identity as verified, but it is not required to log in.

Email verification is application-owned so local and Firebase accounts have the
same behavior:

- Store `email_verified_at`, a SHA-256 hash of a one-time token, and its expiry
  in `users`.
- Send a verification link with the existing server-side Resend REST boundary.
- Point the link to a client verification page; the client submits the token in
  a POST body so it is not placed in an API access-log URL.
- Never log or persist the raw token. Rotate the stored hash on resend and
  consume it atomically on successful verification.

## Access policy

The normal `AuthGuard` continues to authenticate unverified sessions. A new
verification guard is applied only to sensitive customer actions:

- authenticated order creation and Stripe checkout-session creation;
- creating product reviews;
- future email/account-identity changes can reuse the same guard.

Catalog browsing, cart, wishlist, account reads, support tickets, order history,
and verification resend remain available. The backend returns a stable
`EMAIL_VERIFICATION_REQUIRED` code and the client displays a verification CTA;
client-only hiding is not relied upon for security. Admins and existing active
accounts are grandfathered as verified during migration so the change does not
lock current users out.

## API contract

Existing routes remain under `/api/users`:

- `POST /register`: accepts either `{ email, password, user: { username } }`
  for local mode or `{ idToken, user: { username } }` for Firebase mode.
- `POST /login`: keeps the existing local or Firebase payload based on the
  configured provider and returns the normal server session.
- `POST /verification/resend`: accepts an email and always returns a generic
  success response; it is rate-limited and does not reveal whether an account
  exists.
- `POST /verification/confirm`: accepts a raw token, consumes it once, and
  returns the updated verification status.
- `GET /me`: exposes `email_verified` as a boolean, never verification token
  material.

The registration response continues to issue the cookie-backed session. It also
returns `email_verified` and `verification_email_sent` so the client can tell
the user what happened without treating a missing local Resend key as verified.

## Email behavior

The current `ResendEmailService` remains dependency-free and uses `fetch`.
Verification email sending is added beside order confirmations with a
deterministic idempotency key based on the user id and token generation. Invalid
recipient addresses are rejected by validation. If Resend is not configured in
development, account creation still succeeds but the response says that email
delivery is unavailable; production startup/configuration must provide a real
key and verified sender before this feature is considered operational.

## Migration and compatibility

The Prisma User model and the raw-MySQL repository contract are updated
together. The additive migration adds nullable verification columns and
backfills existing active users as verified. New users receive `NULL` until the
confirmation endpoint succeeds. The migration is safe against the legacy
baseline and does not alter passwords, roles, sessions, or order ownership.

## Testing

Add focused tests before implementation for:

- local registration and password login;
- Firebase registration/login accepting an unverified provider identity;
- duplicate email/username handling;
- token hashing, expiry, rotation, single-use consumption, and generic resend;
- Resend payload and idempotency key without exposing raw tokens;
- verification guard behavior for unverified, verified, and admin users;
- client provider-aware Signup, pending-verification UI, resend, and confirm
  page states.

Run the package-local typecheck, test, build, lint, and migration/schema checks
that are available after implementation. Do not send a real email or create a
real external Firebase account during unit verification.
