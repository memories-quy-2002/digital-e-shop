# Firebase Authentication Environment Isolation Design

**Date:** 2026-09-11
**Status:** Implemented
**Scope:** Local Firebase Auth testing for Digital-E without touching production users or production mail

## Problem

Digital-E previously had a local API-password authentication path alongside Firebase. That local path has been removed. Firebase is now the only authentication provider, while the Firebase Auth Emulator supplies an isolated local testing target.

The client and Firebase Admin SDK must still select the emulator safely for local testing instead of connecting localhost to the production Firebase project. The local API/database must remain independent from production.

The client now resolves Firebase web configuration from Vite environment variables through a typed resolver. The server still needs Firebase Admin credentials in production or an emulator host for local testing. This keeps environment mistakes explicit and prevents a safe local Firebase workflow from touching production.

## Goals

1. Make localhost Firebase testing use the Firebase Auth Emulator through the local emulator configuration, without an authentication-provider switch.
2. Keep the production Firebase project graduation-project-5bbfb available only to production configuration.
3. Keep local API data in a local database and never point local seed/reset commands at the production database.
4. Exercise the real Firebase Auth client flows locally:
   - registration
   - email verification
   - password reset
   - change-email verification
   - login after verification or email change
5. Keep Firebase-owned email behavior intact. In emulator mode, the action links are inspected in the Emulator UI or terminal instead of being delivered to a real inbox.
6. Make configuration failures explicit and safe, especially an emulator host in a production build or a production Firebase project in the local emulator profile.

## Non-goals

- Creating or paying for a production email domain.
- Sending real email from the local emulator.
- Replacing the existing API authentication contract.
- Changing the production Firebase project during this implementation.
- Deploying to Vercel or changing Vercel environment variables automatically.
- Introducing a second authentication provider abstraction.

## Environment model

| Environment | Client auth | Firebase project | Server auth | Database | Real email |
| --- | --- | --- | --- | --- | --- |
| Local Firebase test | Firebase JS SDK + Auth Emulator | demo-digital-e-local emulator ID | Firebase Admin SDK connected to emulator | Local MySQL database | No; inspect action links |
| Optional preview/staging | Firebase JS SDK | Separate Firebase project digital-e-dev | Firebase Admin SDK with staging service account | Separate staging database | Yes, subject to Firebase limits/settings |
| Production | Firebase JS SDK | graduation-project-5bbfb | Firebase Admin SDK with production service account | Production database | Yes |

The same email address may exist in all three environments because each environment has a separate Firebase namespace and a separate database. No identity is shared merely because the email strings are equal.

## Configuration contract

### Client variables

The Firebase client configuration must be read from Vite variables rather than embedded source constants:

- VITE_FIREBASE_PROJECT_ID
- VITE_FIREBASE_API_KEY
- VITE_FIREBASE_AUTH_DOMAIN
- VITE_FIREBASE_STORAGE_BUCKET
- VITE_FIREBASE_MESSAGING_SENDER_ID
- VITE_FIREBASE_APP_ID
- VITE_FIREBASE_MEASUREMENT_ID (optional)
- VITE_FIREBASE_AUTH_EMULATOR_URL (local only, including protocol, for example http://127.0.0.1:9099)

Rules:

- A local development Firebase profile must use demo-digital-e-local and VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099.
- A production build must reject VITE_FIREBASE_AUTH_EMULATOR_URL.
- A Firebase build must fail early if required Firebase web values are missing.
- The production web configuration must be supplied through Vercel Production environment variables and must not remain in source code.

### Server variables

The server must support:

- FIREBASE_PROJECT_ID
- FIREBASE_CLIENT_EMAIL
- FIREBASE_PRIVATE_KEY
- FIREBASE_AUTH_EMULATOR_HOST (local only, without protocol, for example 127.0.0.1:9099)

Rules:

- When FIREBASE_AUTH_EMULATOR_HOST is set, the server uses an Admin SDK app configured for the emulator and does not require a service-account private key.
- The server must reject an emulator host when NODE_ENV=production.
- The server must reject a production Firebase project ID in the local emulator profile.
- The emulator host must never be included in production environment templates or production deployment instructions.
- Private keys remain only in untracked local/Vercel environment storage and are never written to source, docs, tests, or the repository.

## Runtime behavior

### Client Firebase initialization

client/src/services/firebase.ts will:

1. Resolve a typed environment object from import.meta.env.
2. Initialize the Firebase app with that environment's web configuration.
3. Get the Firebase Auth instance.
4. Immediately call connectAuthEmulator(auth, emulatorUrl) exactly once when the local emulator URL is configured.
5. Continue exposing the existing helper functions used by auth pages.

The helper functions retain their current ownership boundaries:

- sendEmailVerification is a Firebase client operation.
- sendPasswordResetEmail is a Firebase client operation.
- verifyPasswordResetCode and confirmPasswordReset are Firebase client operations.
- verifyBeforeUpdateEmail starts Firebase's email-change verification flow.
- The backend verifies Firebase ID tokens and does not send these emails.

### Server Firebase Admin initialization

server/src/auth/firebase-admin.service.ts will:

1. Read the typed server environment.
2. Set the Admin SDK emulator connection through FIREBASE_AUTH_EMULATOR_HOST when local emulator mode is active.
3. Initialize the Admin SDK with the emulator project ID and no production certificate in emulator mode.
4. Use the existing service-account certificate path only when the emulator host is absent.
5. Continue verifying ID tokens with revocation checking in the normal Firebase path.

The server must not silently fall back from an invalid production credential to the emulator, or from a production runtime to local mode.

### Action-code routes

The client reset-password route accepts Firebase password-reset action-code query parameters. Email-change verification remains a Firebase client flow through verifyBeforeUpdateEmail; after the user signs in again, the server synchronizes the verified Firebase email by UID. These flows must work with action links generated by the emulator, whose host is localhost and whose API key/project ID belong to the local emulator profile.

If an existing route assumes a production-only origin or a hard-coded Firebase project, the route will use the current browser origin and the resolved Firebase configuration instead.

## Local emulator setup

Add a repository-level firebase.json containing only the Auth emulator and Emulator UI:

~~~json
{
  "emulators": {
    "auth": {
      "port": 9099
    },
    "ui": {
      "enabled": true,
      "port": 4001
    }
  }
}
~~~

Run it with the Firebase CLI using the non-production emulator project ID:

~~~powershell
pnpm dlx --allow-build=protobufjs --allow-build=re2 --package=firebase-tools firebase emulators:start --only auth --project demo-digital-e-local
~~~

The emulator is not a Firebase cloud project and does not send mail. Verification and reset actions are captured by the Emulator UI at http://127.0.0.1:4001.

The local client can use the following non-secret emulator web configuration:

~~~env
VITE_FIREBASE_PROJECT_ID=demo-digital-e-local
VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-digital-e-local.firebaseapp.com
VITE_FIREBASE_STORAGE_BUCKET=demo-digital-e-local.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:demo-digital-e-local
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9099
~~~

These values are only for the emulator and must not be copied into the production Vercel environment.

## Local demo identities

A guarded local-only seeder may create deterministic Firebase emulator users using the existing demo emails and UIDs used by the local database seed. Its safety requirements are:

- It exits unless FIREBASE_AUTH_EMULATOR_HOST is set.
- It exits when NODE_ENV=production.
- It creates or updates only the known local demo users.
- It sets emailVerified=false for the baseline so verification gating can be tested.
- It uses the existing demo password used by local QA.
- It never calls the production Firebase Admin endpoint.

The local database seed must use the same deterministic emulator UIDs and must not mark a user as verified unless the corresponding emulator user is also verified. Production seed behavior must not be changed by a local emulator command.

## Security invariants

- No Firebase web API key, project ID, service-account email, or private key is hard-coded in application source.
- The production project ID is not selected by localhost defaults.
- FIREBASE_AUTH_EMULATOR_HOST cannot activate in a production server process.
- A client production build cannot connect to the Auth Emulator.
- Local auth emulator data and local MySQL data are both disposable and independent of production.
- The API still requires its existing AuthGuard, CSRF, CORS, ownership, and role checks.
- The emulator is for development only. Emulator-issued tokens must never be accepted by a production process.
- Local verification requires reading emulator action links, not falsely setting the database verification flag.

## Acceptance criteria

### Configuration

- Starting localhost with the emulator variables connects only to demo-digital-e-local.
- The client has no embedded production Firebase object.
- A production build with an emulator URL fails configuration validation.
- A production server with FIREBASE_AUTH_EMULATOR_HOST fails configuration validation.
- Server Firebase mode starts with a valid production credential when no emulator host is present.

### Functional local Firebase flow

With the Auth Emulator, local API, local database, and client running:

1. A new account can register.
2. The account is initially unverified and the UI shows the verification state.
3. The verification action appears in the Emulator UI.
4. Opening the action link verifies the account.
5. The client can log in after verification and the API accepts its ID token.
6. Password reset creates an emulator action link, and completing it changes the password.
7. Change email creates an emulator action link, and completing it changes the Firebase email and synchronized API user email.
8. The same test email can be used in local and production without a Firebase identity collision because the namespaces and databases differ.

### Regression

- Firebase login remains the only login path in local and production environments.
- Existing production Firebase helper behavior remains available after Vercel variables are configured.
- Client and server typechecks, builds, lint, and unit tests pass.
- No Resend, marketing, order-email, or unrelated seed behavior is reintroduced.

## Operational ownership

The implementation agent changes source, tests, emulator configuration, and documentation. The user supplies or configures environment-specific values outside source control, starts the emulator, performs the browser acceptance flow, and explicitly approves any future staging or production Vercel changes.

## Reference material

- Firebase environment workflows: https://firebase.google.com/docs/projects/dev-workflows/overview-environments
- Firebase multiple projects: https://firebase.google.com/docs/projects/multiprojects
- Connect the Auth Emulator: https://firebase.google.com/docs/emulator-suite/connect_auth
- Firebase API key and environment guidance: https://firebase.google.com/docs/projects/api-keys
