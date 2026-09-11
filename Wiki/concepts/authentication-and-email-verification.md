# Authentication and email verification

Back to [[index]].

## Provider

- Firebase is the only authentication provider in every environment.
- The client signs in with Firebase Email/Password and sends an ID token to the API.
- The server verifies the token with Firebase Admin, reloads the live user row, and issues the same server-owned cookie session.
- Email/password credentials are never compared against the MySQL users.password column.

## Firebase verification state

In production, Firebase owns the verification email, link, and action-code handling. After Firebase creates an account, the client calls sendEmailVerification for the signed-in Firebase user. Firebase can deliver to any recipient address; a paid custom domain is not required.

The default Firebase action handler marks the Firebase user as verified. The user must sign in again so the client sends a fresh ID token. The server reads the verified claim, updates email_verified_at, and exposes the derived email_verified boolean. The server no longer generates verification tokens or exposes verification resend/confirmation endpoints.

The nullable email_verification_token_hash, email_verification_expires_at, and email_verification_sent_at columns remain only for migration and row-shape compatibility with the previous implementation. They are not used to send or consume Firebase verification links.

## Access policy

AuthGuard does not reject an unverified session. An unverified customer may browse, use the cart, wishlist, account, support, and order history. In Firebase mode, the account page can resend a link through the currently signed-in Firebase user. VerifiedEmailGuard protects authenticated purchase, Stripe checkout-session creation, and review creation. Admins and legacy rows with no verification column value are grandfathered in.

If Firebase delivery fails, account creation still succeeds and the user can retry from the account page after signing in again. The server has no separate email provider; Firebase owns production verification, password reset, and email change.
## Customer email delivery

Customer order confirmations are not sent by the current runtime. Database-backed in-app order notifications are the primary order update channel for authenticated customers, while guests use checkout success and protected lookup. Firebase production owns verification, password-reset, and email-change delivery; marketing delivery and its runtime routes have been removed.
## Password reset

Password reset is a client-side Firebase flow. The API does not issue or consume MySQL password-reset tokens.

The local Auth Emulator does not deliver mail. Its `Logs` tab contains the
reset action link with `newPassword=NEW_PASSWORD_HERE`; replace that placeholder
with a URL-encoded disposable password before opening the link.
The emulator then completes the action in its own handler. The client only
passes the app `/reset-password` continuation URL for production, where the
Firebase `oobCode` page handles the reset.
## Email change

Customers submit a new address through the client Firebase verifyBeforeUpdateEmail flow. Firebase sends the verification link and keeps the current address until the new address is confirmed. After the customer signs in again, the server verifies the Firebase claim, checks for an email collision, synchronizes the local user row by Firebase UID, marks it verified, and issues the session.
## Code map

- Firebase client helpers: client/src/services/firebase.ts
- Client signup and account resend: client/src/features/auth/pages/SignupPage.tsx and client/src/features/users/pages/CustomerAccountPage.tsx
- Firebase identity verification and claim synchronization: server/src/auth/firebase-admin.service.ts and server/src/auth/auth.service.ts
- Verification gate: server/src/guards/verified-email.guard.ts
- Public-user compatibility fields: server/src/users/user-public.ts and server/src/users/users.types.ts
- Legacy migration: server/src/database/prisma/migrations/20260910100000_email_verification/
- Password reset: client/src/services/firebase.ts and client/src/features/auth/pages/ResetPasswordPage.tsx
- Email change: client/src/services/firebase.ts and client/src/features/users/pages/CustomerAccountPage.tsx
