# Authentication and email verification

Back to [[index]].

## Provider modes

- Local development defaults to `AUTH_PROVIDER=local` and accepts email/password registration and login.
- Firebase mode accepts a client ID token; the server verifies it with Firebase Admin.
- Production always resolves to Firebase, regardless of a local provider value.
- Both modes issue the same server-owned cookie session and reload the live user row for authorization.

## Verification state

New accounts start with `email_verified_at = NULL`. The server generates a 32-byte token, stores only its SHA-256 hash plus a 24-hour expiry, and asks Resend to deliver `/verify-email?token=...`. The raw token is not persisted, returned in an API response, placed in a cookie, or logged.

`POST /api/users/verification/confirm` consumes the token atomically. The public user contract exposes only `email_verified`; the internal hash and timestamps are removed by `toPublicUser`.

## Access policy

`AuthGuard` does not reject an unverified session. An unverified customer may browse, use the cart, wishlist, account, support, and order history, and can request another link. `VerifiedEmailGuard` protects authenticated purchase, Stripe checkout-session creation, and review creation. Admins and legacy rows with no verification column value are grandfathered in.

Registration succeeds when Resend is unavailable, so a missing local `RESEND_API_KEY` is a delivery state rather than an account-creation failure. Resend and resend-by-email responses remain generic, and auth routes are rate-limited to reduce enumeration and abuse.

## Customer email delivery

Normal customer-facing transactional, security, and marketing messages are sent only when the account's `email_verified_at` is set. This includes order confirmations for authenticated customers, password-reset links and completion notices, email-change security notices to the current address, and marketing welcome messages. The subscription or account operation still completes when delivery is skipped or unavailable.

Verification email and email-change confirmation are deliberate exceptions: they are the messages that prove ownership of a new address, so blocking them would make verification impossible. Guest order confirmations remain eligible because guests do not have an account verification state. An account row with an undefined verification field is treated as a legacy verified row for migration compatibility.

## Password reset

`POST /api/users/password-reset/request` always returns a generic response. Verified local accounts receive a random one-hour token whose SHA-256 hash is stored on the user row. Verified Firebase accounts receive a Firebase Admin action link, and the client reset page handles the Firebase action code. Unverified accounts do not receive a reset email or get a reset token prepared. Confirmation replaces the local password atomically, clears the reset fields, revokes all active sessions, and sends a password-changed security notice only to a verified address. Raw reset tokens are only present in the outbound link and confirmation request.

## Email change

An authenticated customer submits a new address to `POST /api/users/email-change/request`. The current email remains active while the requested address, token hash, and one-hour expiry are stored as pending state. The new address always receives the confirmation link, while the current address receives a security notice only when that current address is verified. Confirmation updates Firebase first when the Firebase provider is active, then atomically replaces the local email and marks it verified; the verified new address receives a change notice afterward, and the old address receives one only when it was verified.

## Code map

- Server provider selection: `server/src/config/env.config.ts`
- Registration and verification routes: `server/src/auth/auth.controller.ts`
- Registration/session rules: `server/src/auth/auth.service.ts`
- Token lifecycle: `server/src/auth/email-verification.service.ts`
- Resend adapter: `server/src/email/resend-email.service.ts`
- Verification gate: `server/src/guards/verified-email.guard.ts`
- User fields and migration: `server/src/users/users.repository.ts` and `server/src/database/prisma/migrations/20260910100000_email_verification/`
- Client signup and confirmation: `client/src/features/auth/pages/SignupPage.tsx` and `client/src/features/auth/pages/VerifyEmailPage.tsx`
- Password reset: `server/src/auth/password-reset.service.ts` and `client/src/features/auth/pages/ResetPasswordPage.tsx`
- Email change: `server/src/auth/email-change.service.ts`, `client/src/features/users/pages/CustomerAccountPage.tsx`, and `client/src/features/auth/pages/ConfirmEmailChangePage.tsx`
