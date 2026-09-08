# Contributing

Thanks for improving Digital-E. This guide keeps changes consistent and easier
to review.

## Before You Start

1. Pull the latest `master`.
2. Create a focused branch.
3. Select Node.js `24.20.0` and pnpm `12.3.4`.
4. Install dependencies for each application:

```powershell
pnpm --dir client install
pnpm --dir server install
```

## Branch Naming

Use a short, descriptive branch name:

```text
feature/customer-notifications
fix/promotion-create-error
docs/readme-refresh
test/k6-readonly-orders
```

## Commit Messages

Use Conventional Commit messages:

```text
feat(customer): add address book
fix(promotions): support discounts schema
docs: update setup guide
test(performance): add read-only customer checks
chore(deps): update package dependencies
```

Common commit types:

- `feat`: user-facing or admin-facing feature.
- `fix`: bug fix.
- `docs`: documentation-only change.
- `test`: tests or test tooling.
- `refactor`: code structure change without behavior change.
- `chore`: maintenance, dependencies, or tooling.

## Development Workflow

Run each package independently in a separate terminal:

```powershell
pnpm --dir server dev
pnpm --dir client dev
```

The server lifecycle runs Prisma generate and `prisma migrate deploy` before
starting development or the compiled server. Use `pnpm --dir server
prisma:migrate` only when intentionally creating a new development migration.

Production client builds require an explicit `VITE_API_BASE_URL`; configure it
in the client deployment environment.

Default local URLs:

- Client: `http://localhost:5173`
- Server: `http://localhost:4000`
- Health check: `http://localhost:4000/api/health`

## Pull Request Checklist

Before opening a pull request:

- Keep the change focused on one feature, fix, or documentation update.
- Do not include unrelated formatting or generated files.
- Verify customer and admin flows touched by the change.
- Document schema assumptions when a backend change depends on table shape.
- Use read-only performance tests unless you are using a cloned test database.

Recommended checks:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
cd client
.\node_modules\.bin\vite.cmd build
```

For backend changes, run syntax checks against changed files:

```powershell
cd server
node --check src\app.js
node --check src\routes\userRoutes.js
node --check src\routes\productRoutes.js
```

## Database Safety

The local database may contain development data. Avoid destructive changes in
normal feature branches.

- Prefer soft-delete behavior for products.
- Keep performance tests read-only unless using a cloned test database.
- Do not run checkout, review creation, cart writes, promotion writes, or admin
  updates against production data.
- Document any new table or column requirement in the related PR.

## Code Style

- Follow existing React, SCSS, Express, service, model, and controller patterns.
- Keep UI changes responsive and verify important desktop and mobile states.
- Keep backend route logic thin; place business rules in services and SQL access
  in models.
- Avoid large unrelated refactors inside feature work.

## Security

- Never commit secrets, cookies, access tokens, database dumps, or `.env` files.
- Unsafe backend requests must follow the existing CSRF token flow.
- Admin-only endpoints must enforce role checks.
- Report suspected credential exposure immediately and rotate affected secrets.
