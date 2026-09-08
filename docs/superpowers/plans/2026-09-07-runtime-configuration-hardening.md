# Runtime Configuration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin the shared runtime toolchain and harden client/server production configuration, CI smoke coverage, and frontend test tooling without restoring a root package workspace.

**Architecture:** Keep `client` and `server` independently installable with their existing package-local manifests, lockfiles, and pnpm policy files. Use one repository-level Node version marker for the shared runtime, explicit production environment validation at each application boundary, and lightweight HTTP smoke checks instead of browser E2E.

**Tech Stack:** Node.js 24.20.0, pnpm 12.3.4, Vite, Vitest, NestJS/Express, Prisma, GitHub Actions, Vercel.

## Global Constraints

- Preserve the root as a non-package container; do not recreate root `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Keep client and server package-local lockfiles and pnpm policy files independent.
- Preserve existing auth, CSRF, CORS, database-target safety, API contracts, and unrelated dirty worktree changes.
- Do not add npm/yarn lockfiles or new runtime dependencies.
- Keep E2E removed; CI smoke checks must use HTTP only.
- Use `VITE_API_BASE_URL` explicitly for production client builds.
- Use Node 24.20.0 and pnpm 12.3.4.

---

### Task 1: Pin the shared runtime toolchain

**Files:**
- Create: `.node-version`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `AGENTS.md`

**Interfaces:**
- `.node-version` contains exactly `24.20.0`.
- Both package manifests continue declaring pnpm `12.3.4` and Node compatibility `>=24.20.0 <25`.
- Active setup documentation tells contributors to use Node 24.20.0 and pnpm 12.3.4.

- [x] **Step 1: Add the exact Node version marker**

Create `.node-version` with:

```text
24.20.0
```

- [x] **Step 2: Update active runtime setup documentation**

Add the exact Node/pnpm versions and the command to select Node 24.20.0. Do not add a root install/start/dev command.

- [x] **Step 3: Verify the version markers**

Run:

```powershell
Get-Content -Raw .node-version
node --version
pnpm --version
```

Expected: marker is `24.20.0`; local Node is upgraded to `v24.20.0`; pnpm is `12.3.4`.

---

### Task 2: Require an explicit production client API URL

**Files:**
- Modify: `client/src/lib/env.ts`
- Modify: `client/src/lib/__tests__/env.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/ci-cd.md`

**Interfaces:**
- Development without a configured URL still resolves to `http://localhost:4000`.
- Production with a configured URL still normalizes it.
- Production without `VITE_API_BASE_URL` throws a clear configuration error.
- CI supplies the non-secret production API URL for production client build and preview smoke checks.

- [x] **Step 1: Add the failing production-missing-env test**

Add this test to `client/src/lib/__tests__/env.test.ts`:

```ts
it("requires an explicit API URL for production builds", () => {
    expect(() => resolveApiBaseUrl({ isProduction: true })).toThrow(
        "VITE_API_BASE_URL is required for production builds",
    );
});
```

- [x] **Step 2: Run the focused client env test**

Run from `client/`:

```powershell
pnpm exec vitest run src/lib/__tests__/env.test.ts --pool=threads
```

Expected: FAIL because production currently falls back to the hard-coded API URL.

- [x] **Step 3: Implement the explicit production requirement**

Replace the production fallback in `resolveApiBaseUrl` with:

```ts
if (!normalizedUrl) {
    throw new Error("VITE_API_BASE_URL is required for production builds");
}

return normalizedUrl;
```

Keep the development local-only behavior unchanged.

- [x] **Step 4: Run the focused test again**

Run the same Vitest command. Expected: all tests in `env.test.ts` pass.

- [x] **Step 5: Configure CI and document deployment**

Set `VITE_API_BASE_URL=https://e-commerce-express-server-app.vercel.app` for the client CI job/build and document that the same variable must be configured in the client Vercel project.

---

### Task 3: Harden production CORS and required server environment

**Files:**
- Modify: `server/src/config/cors.config.ts`
- Modify: `server/src/config/__tests__/cors.config.test.ts`
- Modify: `server/src/config/env.config.ts`
- Modify: `server/src/config/__tests__/env.config.test.ts`
- Modify: `server/.env.example`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/ci-cd.md`

**Interfaces:**
- Production allowed origins contain only the configured client URL or the production default; localhost is never included by default in production.
- Development continues allowing localhost ports.
- Production startup throws a clear error when required database/auth/origin environment variables are absent.
- Development/test fallback behavior remains unchanged.

- [x] **Step 1: Add failing CORS tests**

Extend `cors.config.test.ts` with tests for `resolveAllowedOrigins`:

```ts
it("does not include localhost in production origins", () => {
    expect(resolveAllowedOrigins({ isProduction: true })).toEqual([
        "https://digital-e.vercel.app",
    ]);
});

it("uses only the configured production client origin", () => {
    expect(resolveAllowedOrigins({
        clientUrl: "https://staging.digital-e.example",
        isProduction: true,
    })).toEqual(["https://staging.digital-e.example"]);
});
```

- [x] **Step 2: Add failing production environment validation tests**

Export a pure `getMissingProductionEnvironmentKeys` helper from `env.config.ts` and add tests asserting that a complete production environment returns `[]`, while a missing `DATABASE_URL`, `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, `CSRF_SECRET`, `CLIENT_URL`, or `SERVER_URL` is reported.

- [x] **Step 3: Run the focused server configuration tests**

Run from `server/`:

```powershell
pnpm exec vitest run src/config/__tests__/cors.config.test.ts src/config/__tests__/env.config.test.ts --config vitest.config.ts --pool=threads
```

Expected: FAIL because production origin resolution and required-environment validation do not exist.

- [x] **Step 4: Implement strict production origins**

Add `resolveAllowedOrigins({ clientUrl, isProduction })`, use it to build `allowedOrigins`, and keep the existing local-origin regex only for non-production requests.

- [x] **Step 5: Implement production environment validation**

Validate these raw production keys before the app continues:

```text
DATABASE_URL
DB_HOST
DB_USER
DB_NAME
JWT_SECRET_KEY
JWT_REFRESH_SECRET_KEY
CSRF_SECRET
CLIENT_URL
SERVER_URL
```

Throw `Missing required production environment variables: ...` when any are empty. Do not require optional integrations such as Google OAuth, Firebase Admin, Stripe, Blob, Search API, or Redis.

- [x] **Step 6: Run the focused tests again**

Run the same server Vitest command. Expected: all focused tests pass.

---

### Task 4: Remove legacy client test tooling and add HTTP smoke checks

**Files:**
- Modify: `client/package.json`
- Modify: `client/pnpm-lock.yaml`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ci-cd.md`

**Interfaces:**
- Vitest remains the only client test runner.
- Client test-only packages live in `devDependencies`.
- CI checks the built client preview and compiled server health endpoint over HTTP.
- No Playwright or E2E job is reintroduced.

- [x] **Step 1: Remove the obsolete Jest/Babel configuration**

Delete the legacy `jest` and `eslintConfig` blocks from `client/package.json`. Remove unused Jest/Babel-only packages:

```text
@babel/core
@babel/preset-env
@babel/preset-react
@babel/preset-typescript
@types/jest
babel-jest
jest
jest-environment-jsdom
ts-jest
identity-obj-proxy
```

Move these existing test-only packages from `dependencies` to `devDependencies`:

```text
@testing-library/jest-dom
@testing-library/user-event
```

Keep `@testing-library/dom`, `@testing-library/react`, `vitest`, `jsdom`, and `@vitest/ui`.

- [x] **Step 2: Regenerate the standalone client lockfile**

Run from the repository root:

```powershell
pnpm --dir client install --lockfile-only
pnpm --dir client install --frozen-lockfile
```

Expected: both commands succeed and the client lockfile has no Jest/Babel direct importer entries.

- [x] **Step 3: Add the client preview smoke check**

After the client build, start `pnpm exec vite preview --host 127.0.0.1 --port 4173` in the background, poll `http://127.0.0.1:4173/` with `curl --fail`, and terminate the process with a shell trap.

- [x] **Step 4: Add the server health smoke check**

After the server build, start `node dist/src/server.js` in the background, poll `http://127.0.0.1:4000/api/health` with `curl --fail`, and terminate the process with a shell trap. Use the existing disposable CI MySQL environment.

- [x] **Step 5: Document the smoke checks**

Update CI documentation to state that browser E2E is removed and HTTP preview/health smoke checks provide the lightweight runtime gate.

---

### Task 5: Verify scope and update the plan

**Files:**
- Modify: `docs/superpowers/plans/2026-09-07-runtime-configuration-hardening.md`

**Interfaces:**
- Existing auth/UI/database changes remain in the worktree.
- No root package/workspace metadata returns.
- No E2E files/jobs return.

- [x] **Step 1: Run package checks**

Run:

```powershell
$env:VITE_API_BASE_URL = "https://e-commerce-express-server-app.vercel.app"
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build
Remove-Item Env:VITE_API_BASE_URL

pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

- [x] **Step 2: Verify independent manifests and active references**

Run:

```powershell
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
rg -n --hidden -g '!**/node_modules/**' -g '!**/dist/**' -g '!docs/superpowers/**' -e 'pnpm --filter|test:e2e|playwright\\.config|e2e-server' .
```

Expected: installs pass and no active root/workspace/E2E references remain.

- [x] **Step 3: Review the final diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm unrelated dirty files remain untouched and report any non-zero command honestly.

The global server `strict` TypeScript mode remains deferred: a probe exposed
pre-existing type errors across the legacy repository layer, so enabling it in
this configuration task would expand scope beyond runtime hardening.
