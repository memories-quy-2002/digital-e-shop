Back to [[index]].

# Production environment configuration

**TL;DR:** The client needs a public Vite build configuration, while the API
needs database, session, Firebase Admin, and live PayOS configuration. Store
server credentials in the deployment environment, never in client variables.
The operational setup checklist is in
[the development guide](../../docs/DEVELOPMENT.md#production-deployment-variables).

## Client build

Production builds require `VITE_API_BASE_URL` and six Firebase web values:
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`,
`VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`,
`VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
`VITE_FIREBASE_MEASUREMENT_ID` is optional. The client fixes the production
Firebase project ID to `graduation-project-5bbfb` and rejects
`VITE_FIREBASE_AUTH_EMULATOR_URL` outside development.

Vite embeds `VITE_*` values in browser assets. Firebase web configuration and
the Firebase API key are public identifiers/configuration, not server
credentials. Restrict the key to the Firebase APIs and app origins in use.

## Server runtime

The server checks a required production key list before startup. It includes
`DATABASE_URL`, `DB_HOST`, `DB_USER`, `DB_NAME`, `JWT_SECRET_KEY`,
`JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, `PAYMENT_PROVIDER_MODE`,
`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`, `CLIENT_URL`, and
`SERVER_URL`. Production also requires `PAYMENT_PROVIDER_MODE=live`.

Firebase has a separate validator: `FIREBASE_PROJECT_ID` is required, and when
the Auth Emulator is not configured, `FIREBASE_CLIENT_EMAIL` and
`FIREBASE_PRIVATE_KEY` are required. The emulator host is rejected in
production. Treat the service-account private key as a secret and keep all
Firebase Admin values server-side.

### Database password validation gap

The MySQL pool reads `DB_PASSWORD`, so a production database account that
requires a password must receive it. The current production missing-key list
does not include `DB_PASSWORD`; set it explicitly and account for that gap
when reviewing startup validation.

### Optional server integrations

- `BLOB_READ_WRITE_TOKEN` is needed by Blob-backed upload operations.
- `REDIS_URL` enables shared rate-limit counters across server instances. If it
  is absent, counters are process-local and are not shared by serverless
  instances.
- `PAYOS_BASE_URL` defaults to PayOS's production endpoint; `PAYOS_PARTNER_CODE`
  is optional.
- `OTEL_ENABLED` and `OTEL_EXPORTER_OTLP_ENDPOINT` are only needed when using a
  collector. `OTEL_EXPORTER_OTLP_HEADERS` is only needed when it requires
  authentication.

## Deployment boundary

Set `VITE_*` values for the client Production build and API values for the
server runtime. Treat client values as public configuration; mark server
credentials as Sensitive and scope them to Production. Vercel applies changed
variables to new deployments, so environment changes require a redeploy. Never
place server secrets in the client bundle or tracked environment templates.

## Source map

- `client/src/lib/env.ts` validates the production API URL.
- `client/src/services/firebaseConfig.ts` validates the Firebase client values
  and emulator boundary.
- `server/src/config/env.config.ts` validates production keys, PayOS mode, and
  Firebase Admin configuration.
- `server/src/config/database.config.ts` passes `DB_PASSWORD` to the MySQL
  pool.
- `server/src/middleware/rate-limit.middleware.ts` selects Redis when
  `REDIS_URL` is configured.
- `server/src/blob/blob.service.ts` reads `BLOB_READ_WRITE_TOKEN` for uploads.
