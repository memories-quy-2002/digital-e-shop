# Provider-Aware Signup and Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> Historical plan note (superseded 2026-09-11): this plan describes the former provider-aware/local-auth architecture and must not be used to reintroduce local password authentication or server-owned email delivery.

**Goal:** Align local/Firebase registration, add Resend-backed verification, and enforce sensitive-action restrictions for unverified sessions.

**Architecture:** Keep provider selection in the existing client/server env resolvers. Add a local registration branch and preserve Firebase token registration. Add application-owned verification state and token operations to the auth/users boundary, reuse the existing Resend service, and add a narrowly scoped Nest verification guard instead of changing `AuthGuard` globally.

**Tech Stack:** React 19, Vite, React Router, Vitest, NestJS 11, Express adapter, Zod, MySQL repositories, Prisma migrations/schema, Firebase Admin, Resend REST via built-in `fetch`, SCSS.

**Spec:** `docs/superpowers/specs/2026-09-10-provider-aware-signup-email-verification-design.md`

## Global Constraints

- Keep `client/` and `server/` as independent pnpm packages; do not add root orchestration.
- Preserve server cookie sessions, CSRF exclusions, route prefixes, role/ownership checks, and route-local response conventions.
- Never trust client-supplied ids, roles, or verification state.
- Store only hashes of verification tokens; never log or return raw tokens.
- Use additive MySQL/Prisma migration changes and update both schema and raw repository SQL.
- Keep existing Resend REST/fetch integration; do not add an SDK dependency without a concrete need.
- Preserve unrelated dirty worktree changes and do not commit `.env` files.

---

### Task 1: Lock the auth and token contracts with failing server tests

**Files:**
- Modify: `server/src/auth/auth-flow.spec.ts`
- Create: `server/src/auth/email-verification.service.spec.ts`
- Create: `server/src/guards/verified-email.guard.spec.ts`
- Modify: `server/src/users/users-public-boundary.spec.ts`

**Interfaces:**
- The tests define the provider-aware registration inputs, public `email_verified` output, verification service behavior, and `EMAIL_VERIFICATION_REQUIRED` guard response before implementation.

- [ ] **Step 1: Add failing tests for provider-aware registration validation**

Assert that local registration accepts `{ email, password, user: { username } }`, Firebase registration accepts `{ idToken, user: { username } }`, and forged `id`, `role`, or verification fields are rejected.

- [ ] **Step 2: Add failing tests for public verification state**

Extend the sanitized public-user fixtures with `email_verified_at` and assert the public boundary exposes only boolean `email_verified`, never token hashes or raw token fields.

- [ ] **Step 3: Add failing token-service tests**

Cover token generation, SHA-256 hash persistence, expiry rejection, single-use consumption, resend rotation, invalid email skip, and Resend idempotency payload. Mock `fetch` only at the network boundary.

- [ ] **Step 4: Add failing guard tests**

Assert unverified customers receive HTTP 403 with `{ code: "EMAIL_VERIFICATION_REQUIRED" }`, verified customers pass, and admins pass regardless of verification state.

- [ ] **Step 5: Run focused tests and confirm expected failures**

Run:

```powershell
pnpm.cmd --dir server exec vitest run src/auth/auth-flow.spec.ts src/auth/email-verification.service.spec.ts src/guards/verified-email.guard.spec.ts src/users/users-public-boundary.spec.ts
```

Expected: the new tests fail because the provider-aware DTO, verification service, public field, and guard do not exist yet.

### Task 2: Add the verification data model and repository operations

**Files:**
- Create: `server/src/database/prisma/migrations/20260910100000_email_verification/migration.sql`
- Modify: `server/src/database/prisma/schema.prisma:12-25`
- Modify: `server/src/users/users.types.ts`
- Modify: `server/src/users/users.repository.ts`
- Modify: `server/src/users/user-public.ts`

**Interfaces:**
- Add `email_verified_at`, `email_verification_token_hash`, `email_verification_expires_at`, and `email_verification_sent_at` to `UserRow`.
- Add repository methods `findByUsername`, `createLocalUser`, `setVerificationToken`, `consumeVerificationToken`, `markEmailVerified`, `setEmailVerificationSentAt`, and `markExistingActiveUsersVerified`.

- [ ] **Step 1: Add the failing repository contract assertions**

Add unit-level SQL assertions for parameterized email/username lookup, local user insertion, token update, atomic token consume, and verification timestamp update.

- [ ] **Step 2: Add the additive migration**

Use information-schema guarded `ALTER TABLE users ADD COLUMN` statements for the four nullable verification columns. Backfill active existing users with `email_verified_at = COALESCE(created_at, UTC_TIMESTAMP())`. Do not modify passwords, ids, roles, or session tables.

- [ ] **Step 3: Update Prisma and backend row types**

Map the four fields in the Prisma `User` model and add nullable/date types to `UserRow`.

- [ ] **Step 4: Implement parameterized repository methods**

Use the existing `mysql` pool and callbacks. The consume query must include the hash, non-null expiry, and `email_verified_at IS NULL`, then update the timestamp and clear hash/expiry in one guarded statement.

- [ ] **Step 5: Make the public-user boundary explicit**

Remove verification token fields from public output and add `email_verified: Boolean(user.email_verified_at)` without exposing the database timestamp unless the existing account contract needs it.

- [ ] **Step 6: Run the repository/public-boundary tests**

Run the focused server tests and confirm they still fail only at higher auth/service behavior, not because of SQL/type mistakes.

### Task 3: Implement provider-aware registration and verification service

**Files:**
- Modify: `server/src/auth/auth.dto.ts`
- Modify: `server/src/auth/auth.validator.ts`
- Modify: `server/src/auth/auth.service.ts`
- Modify: `server/src/auth/firebase-admin.service.ts`
- Create: `server/src/auth/email-verification.service.ts`
- Modify: `server/src/email/resend-email.service.ts`
- Modify: `server/src/email/email.module.ts`
- Modify: `server/src/auth/auth.module.ts`

**Interfaces:**
- `RegisterUserInput` becomes a discriminated local/Firebase input after Zod validation.
- `FirebaseIdentity` includes `emailVerified` from the decoded provider token.
- `EmailVerificationService.createAndSend(user)` creates the raw token only in memory, persists its hash/expiry, and returns delivery status.
- `EmailVerificationService.confirm(rawToken)` consumes the hash atomically and returns the verified public user state.

- [ ] **Step 1: Add the failing local registration tests**

Assert the service rejects registration when the configured provider is incompatible, creates a Customer with a bcrypt-verifiable password and server-generated id in local mode, rejects duplicate email/username with 409, and issues the normal session.

- [ ] **Step 2: Add the failing Firebase registration tests**

Assert Firebase registration uses only verified token identity fields, remains Customer-only, accepts an unverified provider claim, and preserves an already verified claim as the initial app verification state.

- [ ] **Step 3: Add the failing verification flow tests**

Assert registration creates and sends a verification token, missing `RESEND_API_KEY` reports delivery unavailable without marking the account verified, confirm marks the account once, expired/used tokens fail, and resend invalidates the previous token.

- [ ] **Step 4: Implement the generic Resend verification email method**

Build text and escaped HTML content containing the client verification URL. Validate the recipient, use `Authorization: Bearer`, `Content-Type: application/json`, and an idempotency key such as `email-verification-${user.id}-${tokenHash.slice(0, 16)}`. Preserve the existing order-confirmation behavior.

- [ ] **Step 5: Implement the verification service**

Generate at least 32 bytes of entropy, hash with SHA-256, expire after 24 hours, persist only the hash, and call Resend without logging the raw token. Use a generic result for unknown/invalid resend recipients.

- [ ] **Step 6: Implement local and Firebase registration branches**

For local mode, normalize email, hash the submitted password, create a server-generated id, and set `auth_provider = 'local'`. For Firebase mode, verify the ID token with revocation checking and set `auth_provider = 'firebase'` plus `provider_user_id`. Issue the existing server session for both paths.

- [ ] **Step 7: Update auth module dependency wiring**

Import `EmailModule` into `AuthModule` and export the verification service only where needed. Keep the current CSRF exclusions for login/register/refresh and add verification resend/confirm only if their final request method requires it.

- [ ] **Step 8: Run focused auth/email tests and confirm green**

Run:

```powershell
pnpm.cmd --dir server exec vitest run src/auth/auth-flow.spec.ts src/auth/email-verification.service.spec.ts src/guards/verified-email.guard.spec.ts src/users/users-public-boundary.spec.ts src/email/__tests__/resend-email.service.test.ts
```

### Task 4: Add confirmation/resend endpoints and the verified-email guard

**Files:**
- Create: `server/src/guards/verified-email.guard.ts`
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/auth/auth.module.ts`
- Modify: `server/src/orders/orders.controller.ts`
- Modify: `server/src/reviews/reviews.controller.ts`
- Modify: `server/src/support/support.module.ts` only if dependency wiring requires it

**Interfaces:**
- Add `@RequireVerifiedEmail()` metadata and `VerifiedEmailGuard` for sensitive routes.
- Add `POST /api/users/verification/resend` and `POST /api/users/verification/confirm`.
- Return existing `{ msg }` compatibility fields plus stable `code` values.

- [ ] **Step 1: Add failing controller contract tests**

Cover generic resend responses, confirm success/expired errors, and response metadata containing `email_verified` and `verification_email_sent` after registration.

- [ ] **Step 2: Implement Zod request schemas**

Validate trimmed email and token strings with bounded lengths. Do not accept user ids or verification flags from the client.

- [ ] **Step 3: Implement resend and confirm endpoints**

Use `202`/`200` route-local conventions, generic resend output to limit account enumeration, and the existing request-id response helper where the controller already uses it.

- [ ] **Step 4: Implement the narrow verification guard**

Read the live user from `UsersRepository`, bypass only active admins, and throw a 403 `ForbiddenException` with `msg`, `code`, and a safe `emailVerified: false` detail for unverified customers.

- [ ] **Step 5: Apply the guard to sensitive actions**

Apply `AuthGuard`, `VerifiedEmailGuard`, and existing ownership/role metadata to authenticated purchase, Stripe checkout-session, and review creation routes. Do not alter guest checkout or order reads.

- [ ] **Step 6: Run guard/controller/order/review tests**

Run the affected server test files and confirm existing ownership and admin behavior remains unchanged.

### Task 5: Update the client auth flow and UI

**Files:**
- Modify: `client/src/features/auth/api.ts`
- Modify: `client/src/features/auth/pages/SignupPage.tsx`
- Modify: `client/src/features/auth/pages/LoginPage.tsx`
- Modify: `client/src/services/firebase.ts`
- Modify: `client/src/context/AuthContext.tsx`
- Modify: `client/src/features/users/pages/CustomerAccountPage.tsx`
- Create: `client/src/features/auth/pages/VerifyEmailPage.tsx`
- Create: `client/src/features/auth/pages/VerifyEmailPage.test.tsx`
- Modify: `client/src/routes/router.tsx`
- Modify: `client/src/types/user.ts`
- Modify: `client/src/styles/features/auth/_signup.scss`
- Modify: `client/src/styles/features/auth/_login.scss`
- Modify: `client/src/styles/features/users/_customer-account.scss`

**Interfaces:**
- `registerUser` accepts the provider-aware registration union and returns session/public verification metadata.
- Add `resendVerification(email)` and `confirmEmailVerification(token)` API helpers.
- `UserData` includes `email_verified?: boolean` for backward-compatible cached sessions.

- [ ] **Step 1: Add failing client API tests**

Assert local registration sends email/password, Firebase registration sends only idToken, resend/confirm use the expected endpoints, and no raw token is persisted in session storage.

- [ ] **Step 2: Add failing Signup tests**

Mock `isLocalAuth` and assert local Signup does not initialize Firebase, Firebase Signup keeps the ID-token flow, valid TLDs longer than four characters are accepted, and success explains that login is available while verification is pending.

- [ ] **Step 3: Implement provider-aware Signup**

Branch before Firebase calls. Keep server-generated identity/role rules, trim email/username, replace the restrictive TLD regex with a bounded standard email check, and navigate to the storefront with the returned pending state.

- [ ] **Step 4: Add verification page and account resend behavior**

Add `/verify-email`, submit the query token to the server via POST, render success/expired states, and replace direct Firebase resend in the account page with the server API. Add a login/account banner with a resend CTA for `email_verified === false`.

- [ ] **Step 5: Add sensitive-action client handling**

When API responses contain `EMAIL_VERIFICATION_REQUIRED`, show an inline message and link to verification rather than treating it as a generic authentication failure. Keep validation and checkout errors inline.

- [ ] **Step 6: Run focused client tests**

Run:

```powershell
pnpm.cmd --dir client exec vitest run src/features/auth src/context/__tests__/AuthContext.test.tsx src/features/users/pages/CustomerAccountPage.test.tsx
```

### Task 6: Documentation, environment templates, and complete verification

**Files:**
- Modify: `server/.env.example`
- Modify: `server/.env.docker.example`
- Modify: `README.md`
- Modify: `docs/API.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/log.md`

- [ ] **Step 1: Add failing documentation checks where existing docs tests cover contracts**

Update API/environment assertions if the repository has a matching documentation or OpenAPI test; otherwise verify the route and environment text manually against source.

- [ ] **Step 2: Document provider-aware local/production setup**

Document `AUTH_PROVIDER`, local registration, Firebase Admin requirements, Resend sender requirements, verification routes, restrictions, and the fact that existing active accounts are grandfathered.

- [ ] **Step 3: Update Wiki backlinks and maintenance log**

Add a concise authentication/verification concept page only if the existing Wiki has no suitable page; otherwise update `[[architecture]]`, `[[overview]]`, and `[[log]]` without duplicating source code.

- [ ] **Step 4: Run complete package checks**

Run:

```powershell
pnpm.cmd --dir server typecheck
pnpm.cmd --dir server test -- --run
pnpm.cmd --dir server build
pnpm.cmd --dir server lint
pnpm.cmd --dir client exec tsc -p tsconfig.json --noEmit
pnpm.cmd --dir client test -- --run
pnpm.cmd --dir client build
pnpm.cmd --dir client lint
git diff --check
```

- [ ] **Step 5: Review scope and secrets**

Inspect `git diff`, verify no `.env` files or credential values are staged, confirm unrelated existing changes remain untouched, and report any integration checks unavailable without an isolated MySQL/Resend environment.
