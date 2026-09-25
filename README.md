# Digital-E

Digital-E is a full-stack electronics commerce platform with a customer storefront, checkout, and an operations-focused admin dashboard. The client and API are independent applications built and deployed from separate pnpm packages.

## Product capabilities

- Searchable electronics catalog with filters, facets, product comparison, reviews, and recommendations
- Guest and authenticated carts, server-authoritative checkout, order tracking, and account tools
- PayOS and cash-on-delivery flows with VND pricing, inventory reservations, payment ledger, and verified payment webhooks; optional Stripe support
- Admin workflows for products, inventory, orders, promotions, support, notifications, and analytics

## Reviewer demo

Follow the [reviewer demo path](./docs/DEMO.md) to browse as a guest, place one COD order in the disposable local environment, retrieve it with the guest access token, and connect the browser flow to the k6 and OpenTelemetry evidence.

## Engineering highlights

- NestJS modules keep controllers, business services, and MySQL repositories separate; Zod validates write payloads.
- Firebase verifies identity; the API issues cookie-backed sessions and protects unsafe requests with CSRF checks and owner/role guards.
- MySQL remains the primary runtime store. Prisma provides typed models and forward migrations for a partial database projection.
- OpenTelemetry can export HTTP traces and metrics plus MySQL2 spans over OTLP. It is disabled by default; HTTP query strings and SQL literals are scrubbed before export.
- Read-only k6 profiles check API contracts and latency. The smoke profile is capped at five virtual users and refuses remote targets unless explicitly enabled.
- Package-local CI checks type safety, lint, unit and database integration suites, builds, and API health.

## Technology

| Client                                         | Server and data                              | Quality and operations      |
| ---------------------------------------------- | -------------------------------------------- | --------------------------- |
| React 19, React Router 7, Vite 8, TypeScript 6 | NestJS 11, Express 5, Node.js 24             | Vitest, Testing Library, k6 |
| Tailwind CSS 4, Radix UI, Sass                 | MySQL, Prisma 7, Zod                         | ESLint, GitHub Actions      |
| Axios, Firebase Auth, Recharts                 | Pino, OpenTelemetry, Redis rate-limit option | Separate Vercel deployments |

## Architecture

- client/ contains the React storefront and admin application.
- server/ contains the NestJS API, feature modules, and database integration.
- docs/ contains setup, API, testing, and architecture guides.
- Wiki/ records durable architecture and domain decisions.

MySQL repositories own most runtime queries and transactions. Services coordinate multi-table workflows such as checkout, payment finalization, inventory, and notifications. The API preserves route-specific response contracts for the client.

## Run locally

Requirements: Node.js 24.20.0, pnpm 12.4.2, and Docker for the isolated MySQL database. Install k6 separately when running the performance profile; see the [k6 test guidance](./server/test/README-k6.md).

```powershell
# Windows PowerShell
Copy-Item client/.env.example client/.env.local
Copy-Item server/.env.example server/.env
Copy-Item server/.env.docker.example server/.env.docker
```

```sh
# macOS, Linux, or Git Bash
cp client/.env.example client/.env.local
cp server/.env.example server/.env
cp server/.env.docker.example server/.env.docker
```

Install package dependencies and prepare the isolated database:

```sh
pnpm --dir client install
pnpm --dir server install
pnpm --dir server docker:setup
```

Start the Firebase Auth Emulator, API, and client in separate terminals:

```sh
pnpm --dir server firebase:emulator
pnpm --dir server dev
pnpm --dir client dev
```

The app opens at http://localhost:5173, the API at http://localhost:4000, and API docs at http://localhost:4000/docs. Detailed environment and demo-account instructions are in the [development guide](./docs/DEVELOPMENT.md).

## Verify

    pnpm --dir client exec tsc -p tsconfig.json --noEmit
    pnpm --dir client test -- --run
    pnpm --dir client build
    pnpm --dir server typecheck
    pnpm --dir server test -- --run
    pnpm --dir server build
    pnpm --dir server perf:smoke

The k6 smoke profile sends GET requests to a seeded local API by default. See [k6 test guidance](./server/test/README-k6.md) before targeting a remote test deployment. Run it only against disposable or approved test data.

## OpenTelemetry

Start an OTLP/HTTP-compatible collector, then enable export in the server environment:

    OTEL_ENABLED=true
    OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

The default service name is digital-e-server. Signal-specific endpoints and headers are supported for hosted collectors; the exporters use OTLP/HTTP protobuf. See the [architecture guide](./docs/ARCHITECTURE.md) for data captured and privacy behavior. Never commit collector credentials.

## Project guides

[Architecture](./docs/ARCHITECTURE.md) · [API](./docs/API.md) · [Testing](./docs/TESTING.md) · [Development](./docs/DEVELOPMENT.md) · [Project Wiki](./Wiki/index.md) · [Security](./SECURITY.md)
