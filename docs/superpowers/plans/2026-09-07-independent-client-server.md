# Independent Client and Server Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `client` and `server` independently installable and runnable without a root pnpm workspace, run Prisma generation and deployed migrations before every server `dev`/`start`, and remove the E2E test project and CI job.

**Architecture:** Each deployable application owns its package manifest, lockfile, dependencies, and runtime scripts. The repository root remains a documentation/CI container only; it has no package manifest, pnpm workspace metadata, lockfile, or installed dependencies. Playwright E2E is removed rather than moved into another package.

**Tech Stack:** pnpm 12.3.4, Node.js 24, React/Vite client, NestJS/Express-compatible server, Prisma 7, Vitest, GitHub Actions, Vercel.

## Global Constraints

- Use pnpm only; do not add npm or yarn lockfiles.
- Preserve unrelated dirty worktree changes, including auth changes, the existing `server/package.json` type dependency addition, and test artifacts.
- Preserve the existing database-target safety guard.
- Use `prisma migrate deploy` for startup; retain `prisma:migrate` for intentional development migration creation.
- Do not preserve or recreate root `package.json`, `pnpm-lock.yaml`, or `pnpm-workspace.yaml`.
- Remove `e2e/`, Playwright root configs, the E2E-only server bootstrap, and the CI E2E job.
- Keep client/server API, auth, CSRF, CORS, and database behavior unchanged.

---

### Task 1: Add regression coverage for independent startup scripts

**Files:**
- Modify: `server/src/config/__tests__/workspace-startup.test.ts`

**Interfaces:**
- The test reads `server/package.json` relative to the test file.
- The test asserts server lifecycle preparation and the client development script.

- [x] **Step 1: Replace the root-workspace assertion**

Read `../../../package.json` from the test file (this resolves to `server/package.json`) and assert:

```ts
expect(packageJson.scripts?.predev).toBe("pnpm prisma:prepare");
expect(packageJson.scripts?.prestart).toBe("pnpm prisma:prepare && pnpm build:compile");
expect(packageJson.scripts?.["prisma:prepare"]).toBe(
    "pnpm prisma:generate && pnpm prisma:migrate:deploy",
);
```

Also read `client/package.json` and assert `scripts.dev === "vite"`.

- [x] **Step 2: Verify the test is red**

Run from `server/`:

```powershell
pnpm exec vitest run src\config\__tests__\workspace-startup.test.ts --config vitest.config.ts --pool=threads
```

Expected: FAIL because the current manifests do not contain the new lifecycle scripts.

---

### Task 2: Make client and server package scripts self-contained

**Files:**
- Modify: `client/package.json`
- Modify: `server/package.json`
- Modify: `server/api/package.json`

**Interfaces:**
- Client `pnpm dev` and `pnpm start` invoke Vite.
- Server `predev` and `prestart` invoke `prisma:prepare`.
- `prisma:prepare` runs generate then checked-in migration deployment.
- Server owns `concurrently`; the deleted root installation is not needed.

- [x] **Step 1: Add client development script**

Add `"dev": "vite"` to `client/package.json`.

- [x] **Step 2: Add server-local startup preparation**

Preserve existing scripts and add/update:

```json
"prestart": "pnpm prisma:prepare && pnpm build:compile",
"predev": "pnpm prisma:prepare",
"prisma:prepare": "pnpm prisma:generate && pnpm prisma:migrate:deploy",
"dev": "tsc -p tsconfig.build.json && pnpm copy:assets && concurrently -k -n tsc,node \"tsc -p tsconfig.build.json --watch --preserveWatchOutput\" \"node --watch --watch-path=dist dist/src/server.js\"",
"build:compile": "tsc -p tsconfig.build.json && pnpm copy:assets",
"build": "node scripts/prisma-generate.mjs && tsc -p tsconfig.build.json && pnpm copy:assets",
"vercel-build": "node scripts/prisma-generate.mjs && tsc -p tsconfig.build.json && pnpm copy:assets"
```

Add `concurrently` to `server.devDependencies`, preserving the pre-existing `@types/express-serve-static-core` entry.

- [x] **Step 3: Remove server/api root delegation**

Set `server/api/package.json`'s build script to:

```json
"vercel-build": "pnpm --dir .. run build"
```

- [x] **Step 4: Verify the focused regression test is green**

Run the Task 1 Vitest command again from `server/` and expect PASS.

---

### Task 3: Create independent lockfiles and remove workspace/E2E artifacts

**Files:**
- Create: `client/pnpm-lock.yaml`
- Create: `server/pnpm-lock.yaml`
- Create: `client/pnpm-workspace.yaml`
- Create: `server/pnpm-workspace.yaml`
- Delete: `package.json`
- Delete: `pnpm-lock.yaml`
- Delete: `pnpm-workspace.yaml`
- Delete: `playwright.config.ts`
- Delete: `playwright.local.config.ts`
- Delete: `e2e/auth-boundary.spec.ts`
- Delete: `e2e/checkout.spec.ts`
- Delete: `e2e/storefront.spec.ts`
- Delete: `server/test/e2e-server.ts`
- Delete: root `node_modules/`
- Delete: root `.pnpm-store/`

**Interfaces:**
- Each package installs with its own frozen lockfile.
- Package-local pnpm policy files retain approved build scripts and server dependency overrides without restoring a root workspace.
- No root package metadata or E2E test files remain.

- [x] **Step 1: Generate standalone lockfiles**

After manifest updates and before removing workspace metadata, run:

```powershell
pnpm --dir client install --lockfile-only --ignore-scripts
pnpm --dir server install --lockfile-only --ignore-scripts
```

Expected: each package lockfile contains only its own importer.

- [x] **Step 2: Remove exact root and E2E targets**

Delete only the files listed above and the exact root `node_modules` and `.pnpm-store` directories. Do not delete client/server `node_modules`, k6 tests, or unrelated untracked files.

- [x] **Step 3: Reinstall independently**

Run:

```powershell
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
```

Expected: both installs succeed without a root workspace.

---

### Task 4: Update CI, Dependabot, deployment configuration, and documentation

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/dependabot.yml`
- Modify: `server/vercel.json`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/DEVELOPMENT.md`
- Modify: `docs/ci-cd.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/bmad/product-brief.md`
- Modify: `docs/bmad/qa-checklist.md`
- Modify: `docs/ai-prompts/test.md`
- Modify: `docs/CODEX_ORCHESTRATION.md`
- Modify: `AGENTS.md`
- Modify: `Wiki/overview.md`
- Modify: `Wiki/architecture.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- CI installs and verifies client/server locally and has no E2E/Playwright job.
- Dependabot watches `/client` and `/server` independently.
- Vercel server install/build uses the server lockfile and package scripts.
- Active documentation uses `cd` or `pnpm --dir`, never root workspace filters.

- [x] **Step 1: Convert CI jobs**

Client: pin pnpm `12.3.4`, use `client/pnpm-lock.yaml` for cache, install in `client`, and run local typecheck/lint/test/build commands there.

Server: pin pnpm `12.3.4`, use `server/pnpm-lock.yaml` for cache, install in `server`, and convert all `pnpm --filter server ...` commands to local commands under `working-directory: server`. Preserve MySQL setup and server/api build validation.

Delete the complete E2E job, including its service, Playwright installation, test command, and artifact upload.

- [x] **Step 2: Split Dependabot package directories**

Replace the root npm update block with equivalent `/client` and `/server` blocks. Preserve schedule, grouping, labels, limits, commit-message settings, and major-version ignore rules. Keep GitHub Actions updates at `/`.

- [x] **Step 3: Make server Vercel configuration local**

Set:

```json
"installCommand": "pnpm install --frozen-lockfile",
"buildCommand": "pnpm run build"
```

- [x] **Step 4: Rewrite active docs**

Replace root installation/startup examples with:

```powershell
pnpm --dir server install
pnpm --dir client install
pnpm --dir server dev
pnpm --dir client dev
```

Document that root `pnpm install`, `pnpm start`, `pnpm dev`, and `pnpm --filter` are intentionally unavailable. Document the server Prisma startup order and manual migration-creation workflow. Remove E2E/Playwright references from active setup/testing docs; leave historical plans/specs unchanged. Bump `Wiki/index.md`'s date and append one line to `Wiki/log.md`.

---

### Task 5: Verify the complete change and review scope

**Files:**
- Inspect: changed/deleted paths and `git status --short`

- [x] **Step 1: Verify active references**

Run:

```powershell
rg -n --hidden -g '!**/node_modules/**' -g '!**/dist/**' -g '!pnpm-lock.yaml' -g '!test-results/**' -e 'pnpm-workspace|--filter (client|server)|test:e2e|playwright\.config|e2e-server' .
```

Expected: no active configuration/documentation references outside historical plans/specs.

- [x] **Step 2: Run package checks**

Run:

```powershell
pnpm --dir client exec tsc -p tsconfig.json --noEmit
pnpm --dir client lint
pnpm --dir client test -- --run
pnpm --dir client build
pnpm --dir server prisma:validate
pnpm --dir server typecheck
pnpm --dir server lint
pnpm --dir server test -- --run
pnpm --dir server build
```

Report each command separately with its actual exit status.

- [x] **Step 3: Review deletion and dirty-change scope**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Confirm existing auth changes, the server type dependency addition, and unrelated test artifacts remain untouched. Confirm root `node_modules` is absent and client/server dependencies remain available.
