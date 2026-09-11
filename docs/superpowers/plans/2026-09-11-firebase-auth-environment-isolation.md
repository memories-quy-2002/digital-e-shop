# Firebase Authentication Environment Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ] ) syntax for tracking.

**Goal:** Make Firebase registration, email verification, password reset, and change-email verification testable on localhost through the Firebase Auth Emulator while keeping the production Firebase project, production database, and production email flows isolated.

**Architecture:** Keep the existing Firebase helper API and API token contract. Move Firebase web configuration into a typed environment resolver, connect the client and Firebase Admin SDK to the Auth Emulator only under an explicit local profile, and add a guarded local demo-user seeder. Keep cloud project graduation-project-5bbfb production-only. Use a separate Firebase project digital-e-dev and separate database only if real-email preview testing is later required.

**Tech Stack:** React 19, Vite 8, Firebase JS SDK, NestJS 11, Firebase Admin SDK, MySQL, Firebase Auth Emulator, Vitest, pnpm 12.3.4, Node 24.20.0.

**Spec:** docs/superpowers/specs/2026-09-11-firebase-auth-environment-isolation-design.md

## Global Constraints

- Work directly on the current branch bugfix/demo-seed-ssl-ca; do not create a worktree.
- Keep client/ and server/ independently installable and runnable. Do not add a root pnpm workspace or root orchestration.
- Do not change production Firebase, production Vercel variables, production database data, or deploy anything as part of this plan.
- Remove the hard-coded Firebase web configuration from source, but never copy real secrets into tracked files.
- Preserve the existing API routes, AuthGuard, CSRF, CORS, ownership, roles, cookie behavior, and response shapes.
- Use Firebase as the only authentication provider in every environment. Local development uses the Firebase Auth Emulator; do not add provider-selection environment switches.
- The Firebase Auth Emulator is development-only. Production must reject emulator configuration.
- Use apply_patch for edits, keep unrelated dirty worktree changes untouched, and stage or commit only when explicitly requested.
- Run each package's commands from its own package directory through pnpm --dir client ... or pnpm --dir server ....
- Do not modify Resend, marketing, order-notification, or unrelated catalog/seed work while implementing this plan.
- Do not mark a database user verified merely because the API seed ran; Firebase/Auth Emulator state is the source of truth for Firebase verification.
- The commit checkpoints below are optional handoff points; do not stage or commit them without the user's explicit approval.

## File Map

| File | Responsibility |
| --- | --- |
| client/src/services/firebaseConfig.ts | Typed Firebase client environment contract and validation |
| client/src/services/firebaseConfig.test.ts | Unit coverage for local emulator and production safety rules |
| client/src/services/firebase.ts | Initialize Firebase with resolved config and connect Auth Emulator once |
| client/src/services/firebase.test.ts | Unit coverage for Firebase initialization and helper wiring, if the existing test layout supports it |
| client/.env.example | Document client provider and Firebase variables without secrets |
| server/src/config/env.config.ts | Parse and validate Firebase Admin credentials and emulator host |
| server/src/config/__tests__/env.config.test.ts | Unit coverage for server emulator/production validation |
| server/src/auth/firebase-admin.service.ts | Initialize Firebase Admin against emulator or production credentials |
| server/src/auth/firebase-admin.service.spec.ts | Unit coverage for emulator and service-account initialization paths |
| server/.env.example | Document server emulator variables without credentials |
| firebase.json | Repository-level Auth Emulator and Emulator UI ports |
| server/src/database/seeders/seedFirebaseEmulatorUsers.js | Guarded deterministic local Auth Emulator user setup |
| server/src/database/seeders/demoSeedData.js | Align Firebase demo verification state with the selected environment |
| server/src/database/seeders/demoSeedData.test.ts | Regression coverage for deterministic UID and verification-state assumptions |
| docs/DEVELOPMENT.md | Local emulator startup and environment setup |
| docs/TESTING.md | Manual verification/reset/change-email acceptance flow |
| Wiki/concepts/authentication-and-email-verification.md | Explain the environment matrix and Firebase ownership |
| Wiki/architecture.md | Record the client/Admin SDK/emulator boundary |
| Wiki/overview.md | Update local development assumptions |
| Wiki/index.md | Update catalog date and relevant auth link |
| Wiki/log.md | Append the architecture/documentation maintenance entry |

---

## Task 1: Define and test the environment contract

**Files:**

- Create client/src/services/firebaseConfig.ts
- Create client/src/services/firebaseConfig.test.ts
- Modify client/src/lib/env.ts
- Modify client/.env.example
- Modify server/src/config/env.config.ts
- Modify server/src/config/__tests__/env.config.test.ts
- Modify server/.env.example

**Interfaces:**

~~~ts
export type FirebaseClientMode = "emulator" | "production";

export interface FirebaseClientEnvironment {
  mode: FirebaseClientMode;
  projectId: string;
  config: {
    apiKey: string;
    authDomain: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId?: string;
  };
  authEmulatorUrl?: string;
}

export function resolveFirebaseClientEnvironment(
  values?: Record<string, string | undefined>,
  isDevelopment?: boolean,
): FirebaseClientEnvironment;
~~~

The server environment exposes a normalized firebaseAuthEmulatorHost string or an empty value and retains the existing Firebase project/client-email/private-key fields.

**Steps:**

- [x] Add the client environment resolver with explicit required-key validation. Read all VITE_FIREBASE_* values from import.meta.env; do not retain a production fallback object in firebase.ts.
- [x] Make the resolver return mode: "emulator" only when development mode and VITE_FIREBASE_AUTH_EMULATOR_URL are present. Reject an emulator URL for a production build.
- [x] Reject the known production project ID graduation-project-5bbfb when the resolver is in local emulator mode. Require demo-digital-e-local for the repository's documented local profile.
- [x] Remove provider switching: every client environment resolves Firebase configuration, with the Auth Emulator selected only by the local emulator URL.
- [x] Add client tests for complete emulator values, missing required Firebase values, emulator URL in production, and production project ID in emulator mode.
- [x] Add FIREBASE_AUTH_EMULATOR_HOST parsing to server/src/config/env.config.ts. Normalize only a host:port value such as 127.0.0.1:9099; reject a value containing http:// or https://.
- [x] Add server validation that rejects emulator mode when NODE_ENV=production, and that requires production Firebase credentials when the emulator host is absent.
- [x] Add server tests for valid local emulator values, invalid URL-form host, production-plus-emulator rejection, and production credential requirements.
- [x] Add safe variable names and local examples to both env templates. Keep all credential values as non-secret placeholders and include the warning that emulator configuration is local-only.
- [x] Run the focused client and server config tests before moving to runtime initialization.

**Verification:**

~~~powershell
pnpm --dir client exec vitest run src/services/firebaseConfig.test.ts
pnpm --dir server exec vitest run src/config/env.config.test.ts
~~~

**Commit checkpoint:** fix(auth): define isolated Firebase environment contract

---

## Task 2: Make the Firebase client emulator-aware

**Files:**

- Modify client/src/services/firebase.ts
- Modify client/src/services/firebase.test.ts or add the test file if no focused Firebase service test exists
- Modify affected auth action-code tests only if the existing route contract requires it

**Interfaces:**

~~~ts
export async function loadFirebaseAuth(): Promise<Auth>;
export async function sendFirebaseEmailVerification(): Promise<void>;
export async function sendFirebasePasswordReset(email: string): Promise<void>;
export async function sendFirebaseEmailChangeVerification(
  nextEmail: string,
): Promise<void>;
~~~

The existing exported helper names and their callers remain unchanged.

**Steps:**

- [x] Import the typed environment resolver and initialize the Firebase app from its resolved web config.
- [x] Add an idempotent connection guard so connectAuthEmulator(auth, authEmulatorUrl) runs immediately after getAuth(app), at most once per module instance, and never for a production configuration.
- [x] Preserve the existing dynamic Firebase imports and helper error propagation so auth pages continue to map Firebase error codes to their current UI messages.
- [x] Keep password-reset and verification action URLs based on window.location.origin, so localhost actions return to localhost and production actions return to production.
- [x] Add service-level tests that mock Firebase app/auth modules and assert the emulator is connected for local emulator mode, it is not connected for production mode, and repeated loadFirebaseAuth calls do not connect twice.
- [x] Search all Firebase service imports and confirm no caller depends on the removed embedded config.
- [x] Run the client typecheck and focused service tests.

**Verification:**

~~~powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client exec vitest run src/services/firebaseConfig.test.ts src/services/firebase.test.ts
~~~

**Commit checkpoint:** fix(client-auth): connect Firebase Auth to the selected environment

---

## Task 3: Make Firebase Admin safe for emulator and production

**Files:**

- Modify server/src/auth/firebase-admin.service.ts
- Create or modify server/src/auth/firebase-admin.service.spec.ts
- Modify server/src/auth/auth.module.ts only if dependency injection or module initialization requires it

**Interfaces:**

~~~ts
private getAuthClient(): Auth;
async verifyIdToken(idToken: string): Promise<DecodedIdToken>;
~~~

Keep the existing public service method and decoded-token contract.

**Steps:**

- [x] Add one initialization branch for env.firebaseAuthEmulatorHost: set the Admin SDK emulator host, initialize an app with projectId: env.firebaseProjectId, and obtain Auth from that app without loading a service-account private key.
- [x] Keep the existing certificate branch for non-emulator Firebase mode and preserve revocation checking in verifyIdToken.
- [x] Ensure the app is initialized only once in a process and that test setup can isolate module state between emulator and production cases.
- [x] Do not log private keys, tokens, cookies, email addresses, or raw Firebase credential errors.
- [x] Add unit tests with mocked Firebase Admin modules covering emulator initialization, certificate initialization, single initialization across repeated verification calls, and rejection of invalid environment combinations.
- [x] Run server typecheck, focused tests, and build after the Firebase-only auth cleanup.

**Verification:**

~~~powershell
pnpm --dir server exec vitest run src/auth/firebase-admin.service.spec.ts
pnpm --dir server typecheck
pnpm --dir server build
~~~

**Commit checkpoint:** fix(server-auth): isolate Firebase Admin emulator mode

---

## Task 4: Add a guarded local Auth Emulator and database demo setup

**Files:**

- Create firebase.json
- Create server/src/database/seeders/seedFirebaseEmulatorUsers.js
- Modify server/src/database/seeders/demoSeedData.js
- Modify server/src/database/seeders/demoSeedData.test.ts
- Modify the server seed script only where it is required to invoke the guarded local Auth setup

**Interfaces:**

~~~js
const LOCAL_FIREBASE_PROJECT_ID = "demo-digital-e-local";
const LOCAL_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

async function seedFirebaseEmulatorUsers(): Promise<void>;
~~~

The script may use the existing deterministic demo UID/email/password definitions, but it must not broaden its input to arbitrary user-provided IDs.

**Steps:**

- [x] Add firebase.json with Auth Emulator port 9099 and Emulator UI port 4001; do not add Firestore or Realtime Database emulators because this task only isolates Auth.
- [x] Implement the local Auth seeder with a hard guard: exit with a clear error unless FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 and NODE_ENV != production.
- [x] Make the seeder create or update only the four existing deterministic demo users, set their passwords to the documented demo password, and set emailVerified=false for the baseline.
- [x] Keep the deterministic UIDs aligned with the local MySQL demo data so ID-token subjects map to the correct local API users.
- [x] Update demo seed metadata and tests so Firebase-mode local users are not represented as verified in MySQL before the emulator action link is completed. Preserve any unrelated catalog, order, or seed changes already present in the worktree.
- [x] Ensure the local Auth seeder cannot be called by a production seed path and cannot initialize against graduation-project-5bbfb.
- [x] Document the exact startup order: local MySQL, Auth Emulator, guarded Auth demo seeder, server with emulator variables, and client with Firebase emulator variables.
- [x] Run the seeder's static/unit checks and inspect the diff for any production seed mutation.

**Verification:**

~~~powershell
pnpm dlx --allow-build=protobufjs --allow-build=re2 --package=firebase-tools firebase emulators:start --only auth --project demo-digital-e-local
pnpm --dir server exec tsx src/database/seeders/seedFirebaseEmulatorUsers.js
pnpm --dir server exec vitest run src/database/seeders/demoSeedData.test.ts
~~~

The emulator command is a manual process and should be stopped after the smoke check. Never run the seeder with production environment variables.

**Commit checkpoint:** test(auth): add guarded Firebase emulator demo identities

---

## Task 5: Verify the existing auth pages against emulator action links

**Files:**

- Inspect and modify only the existing auth route/page files that fail the emulator acceptance flow, including the relevant files under client/src/features/auth/ and client/src/pages/
- Add focused tests beside any changed route/page

**Interfaces:**

Preserve the existing route contracts for:

- Firebase verification action handling.
- Firebase password-reset action handling.
- Firebase change-email action handling.
- API login/session synchronization after Firebase authentication.

**Steps:**

- [x] Start the emulator and local apps with the Firebase emulator profile, then register one disposable local account through the UI.
- [x] Confirm the account appears unverified in both Firebase Emulator UI and the application account state.
- [x] Use the verification action link shown by the Emulator UI and confirm the app returns to localhost and the account becomes verified after refresh.
- [x] Request password reset from localhost, open the emulator action link, submit a new password, and confirm login succeeds with the new password.
- [x] Start change-email verification for a disposable account, open the emulator action link, and confirm the Firebase email and API user email are synchronized.
- [x] If any route fails because it assumes a production origin, project, or API key, make the smallest route-local correction and add a regression test.
- [x] Confirm the existing local-provider login still works after the Firebase changes.
- [x] Do not use the user's real production account for the emulator acceptance test; use a disposable local email.

**Verification:**

~~~powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client test -- --run
~~~

Browser acceptance is required in addition to automated tests because the emulator action links and navigation are runtime behavior.

**Commit checkpoint:** test(auth): verify local Firebase email action flows

---

## Task 6: Document environment ownership and operational safety

**Files:**

- Modify docs/DEVELOPMENT.md
- Modify docs/TESTING.md
- Modify Wiki/concepts/authentication-and-email-verification.md
- Modify Wiki/architecture.md
- Modify Wiki/overview.md
- Modify Wiki/index.md
- Modify Wiki/log.md

**Steps:**

- [x] Add a short local setup section with the exact emulator command, ports, env variable names, and startup order.
- [x] Explain that the Emulator UI exposes verification and reset action links instead of sending real email.
- [x] Add a clear environment matrix showing local emulator, optional separate staging Firebase project, and production Firebase.
- [x] State that local API/database and production API/database must be separate, and that the same email is safe across isolated Firebase namespaces.
- [x] Document the production safety checks and the prohibition on committing service-account credentials.
- [x] Update the Wiki index last-updated date and append one concise entry to Wiki log according to repository rules.
- [x] Keep the documentation factual and concise; do not document the user's credentials or any secret values.

**Verification:**

~~~powershell
rg -n "demo-digital-e-local|FIREBASE_AUTH_EMULATOR_HOST|VITE_FIREBASE_AUTH_EMULATOR_URL|graduation-project-5bbfb" docs Wiki client/.env.example server/.env.example firebase.json
git diff --check
~~~

**Commit checkpoint:** docs(auth): document Firebase environment isolation

---

## Task 7: Run the complete quality gate and review the patch

**Files:**

- No new files; review all files changed by Tasks 1-6.

**Steps:**

- [x] Re-read the final diff and confirm only the planned Firebase environment, emulator, auth-flow tests, and documentation files changed.
- [x] Search for hard-coded Firebase web configuration, emulator host in production templates, Resend imports, and accidental secret material.
- [x] Run all relevant frontend checks.
- [x] Run all relevant backend checks.
- [x] Run the local emulator browser acceptance flow once more using a disposable account.
- [x] Verify that client/.env and server/.env remain untracked and contain no newly introduced production or test secrets.
- [x] Report any pre-existing failure separately from regressions introduced by this plan.
- [x] Stop before commit, push, Vercel environment changes, or deployment unless the user explicitly requests the next action.

**Verification:**

~~~powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir client lint
pnpm --dir client test -- --run

pnpm --dir server typecheck
pnpm --dir server build
pnpm --dir server lint
pnpm --dir server test -- --run

rg -n "initializeApp|connectAuthEmulator|FIREBASE_AUTH_EMULATOR_HOST|VITE_FIREBASE_AUTH_EMULATOR_URL|resend|marketing" client/src server/src
git diff --check
~~~

**Commit checkpoint:** chore(auth): verify isolated Firebase development workflow

---

## User actions after implementation

The implementation agent does not need a paid domain or a real email provider for local testing. After the code changes are ready, the user performs these actions in order:

1. Ensure the local MySQL database is not the production database.
2. Install or run Firebase CLI through the documented pnpm dlx firebase command with the pnpm 12 build approvals.
3. Start the Auth Emulator with project ID demo-digital-e-local.
4. Set untracked local client variables:
   - VITE_FIREBASE_PROJECT_ID=demo-digital-e-local
   - VITE_FIREBASE_API_KEY=demo-api-key
   - VITE_FIREBASE_AUTH_DOMAIN=demo-digital-e-local.firebaseapp.com
   - VITE_FIREBASE_STORAGE_BUCKET=demo-digital-e-local.appspot.com
   - VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
   - VITE_FIREBASE_APP_ID=1:000000000000:web:demo-digital-e-local
   - VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
5. Set untracked local server variables:
   - FIREBASE_PROJECT_ID=demo-digital-e-local
   - FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
   - no production private key is needed in emulator mode
6. Restart client and server after changing env files.
7. Run the guarded local Auth demo seeder, then test verification, reset password, and change email through the Emulator UI.
8. If real inbox testing is later needed, create the separate Firebase project digital-e-dev, separate staging database, and separate Vercel Preview variables. Do not reuse graduation-project-5bbfb for localhost.
9. Approve any future Vercel environment-variable update or deployment separately.

## Plan self-review

- Every requirement in the design spec maps to at least one implementation task.
- Every code task identifies files, interfaces, tests, and a verification command.
- Local and production Firebase namespaces are explicitly separated.
- Emulator configuration is rejected in production on both client and server.
- Existing local-provider behavior and existing API contracts are preserved.
- No step asks for production credentials, production data changes, or deployment.
- No placeholder implementation language such as TODO, TBD, or implement as needed is used.
