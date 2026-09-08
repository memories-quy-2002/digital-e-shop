# Dependency and Runtime Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the three workspace manifests and deployment pins with the current stable pnpm/Node toolchain and refresh dependency versions without adopting prerelease Prisma.

**Architecture:** Keep the root `pnpm-workspace.yaml` as the single pnpm settings source, including dependency overrides. Align all package manifests and Vercel/CI runtime pins to pnpm 12.3.4 and Node 24.20.x LTS, then update stable package versions through pnpm so the workspace lockfile remains reproducible.

**Tech Stack:** pnpm workspace, Node.js 24 LTS, React/Vite client, NestJS/Express-compatible server, Prisma 7, Vitest, TypeScript.

**Spec:** User request in the active task: update the root, client, and server `package.json` files to current pnpm, Node.js, and dependency versions.

## Global Constraints

- Use pnpm workspace configuration in `pnpm-workspace.yaml`; do not rely on the deprecated `package.json#pnpm` settings field.
- Use pnpm `12.3.4`, verified as the current registry latest, consistently in root/client/server and Vercel install configuration.
- Use Node `>=24.20.0 <25`, the current Node 24 LTS line; do not switch this production-oriented repository to Node 26 Current.
- Keep Prisma on the stable 7.x line because the registry latest is currently an 8.0.0 release candidate.
- Preserve existing scripts, API contracts, security guards, pnpm overrides, and unrelated working-tree changes.
- Do not commit or push.

---

### Task 1: Align workspace runtime metadata and remove obsolete pnpm settings

**Files:**
- Modify: `package.json`
- Modify: `client/package.json`
- Modify: `server/package.json`
- Modify: `server/vercel.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `docs/ci-cd.md`

- [x] **Step 1: Update metadata**

Set each package manifest's `packageManager` to `pnpm@12.3.4` and each `engines.node` to `>=24.20.0 <25`. Remove the root `package.json#pnpm` block while retaining identical overrides in `pnpm-workspace.yaml`.

- [x] **Step 2: Align deployment and CI pins**

Change `server/vercel.json` to `corepack pnpm@12.3.4 install --frozen-lockfile`, change both CI setup-node entries to `node-version: 24.20.0`, and update the CI/CD documentation to describe workspace YAML as the canonical override source.

- [x] **Step 3: Validate manifest shape**

Run:

```powershell
node -e "for (const file of ['package.json','client/package.json','server/package.json','server/vercel.json']) JSON.parse(require('fs').readFileSync(file, 'utf8')); console.log('JSON valid')"
```

Expected: `JSON valid` and no parse error.

### Task 2: Refresh stable dependency ranges

**Files:**
- Modify: `client/package.json`
- Modify: `server/package.json`
- Modify: `pnpm-lock.yaml`

- [x] **Step 1: Update stable versions**

Use pnpm's latest-version update against the workspace, but retain Prisma 7 stable, NestJS 11, and TypeScript 6 because the current server CommonJS configuration and TypeScript ESLint tooling are not compatible with the newer major lines. The refresh includes compatible current versions such as ESLint 10.10.0, Multer 2.3.0, Sass 1.104.0, `@types/react-dom` 19.2.7, Testing Library Jest DOM 7.0.1, Vitest/UI 5.0.0, jsdom 30.0.1, ioredis 6.0.0, and web-vitals 6.2.1. The unused deprecated root `claude` dependency was removed.

- [x] **Step 2: Regenerate the workspace lockfile**

Run:

```powershell
corepack pnpm@12.3.4 install --lockfile-only
```

Expected: the lockfile resolves the manifest versions without an outdated-lockfile error.

### Task 3: Verify the refreshed workspace

**Files:**
- Verify: `package.json`
- Verify: `client/package.json`
- Verify: `server/package.json`
- Verify: `pnpm-lock.yaml`

- [x] **Step 1: Install from the refreshed lockfile**

Run `corepack pnpm@12.3.4 install --frozen-lockfile` and record any blocked native build scripts separately.

- [x] **Step 2: Run client checks**

Run `corepack pnpm@12.3.4 --filter client exec tsc -p tsconfig.json --noEmit`, `corepack pnpm@12.3.4 --filter client lint`, `corepack pnpm@12.3.4 --filter client test -- --run`, and `corepack pnpm@12.3.4 --filter client build`.

- [x] **Step 3: Run server checks**

Run `corepack pnpm@12.3.4 --filter server typecheck`, `corepack pnpm@12.3.4 --filter server lint`, `corepack pnpm@12.3.4 --filter server test -- --run`, and `corepack pnpm@12.3.4 --filter server build`. If Prisma's Windows engine file is locked, verify the TypeScript build and asset copy separately and report the full build limitation.

- [x] **Step 4: Review the final diff**

Run `git diff --check`, inspect the three manifests and lockfile diff, and confirm the pre-existing `artifacts/playwright-local-home.png` deletion and earlier TLS/env changes remain untouched.
