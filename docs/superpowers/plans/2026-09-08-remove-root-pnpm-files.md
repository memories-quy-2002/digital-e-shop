# Remove Root pnpm Workspace Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `client/` and `server/` fully independent pnpm package roots by removing the redundant root package manifest, lockfile, and workspace configuration without breaking GitHub Actions, Vercel builds, or agent instructions.

**Architecture:** Dependency resolution remains package-local: `client/pnpm-lock.yaml` plus `client/pnpm-workspace.yaml` own the frontend, and `server/pnpm-lock.yaml` plus `server/pnpm-workspace.yaml` own the backend. CI and Vercel commands run from their respective project roots; the Copilot setup workflow will install and typecheck both packages explicitly.

**Tech Stack:** pnpm 12.3.4, Node.js 24.20.0, GitHub Actions, Vercel, React/Vite client, TypeScript server.

## Global Constraints

- Use pnpm only; do not create npm or yarn lockfiles.
- Keep `client/` and `server/` independent and use their existing package-local lockfiles.
- Do not change application runtime, API contracts, authentication, CSRF, CORS, or database behavior.
- Do not modify `.env` files or commit secrets.
- Work on `chore/remove-root-pnpm-files`, not directly on `main`.

---

### Task 1: Convert Copilot setup to package-local installation

**Files:**
- Modify: `.github/workflows/copilot-setup-steps.yml`

**Interfaces:**
- Consumes: `client/pnpm-lock.yaml`, `server/pnpm-lock.yaml`, `.node-version`.
- Produces: A setup job that installs each package with `pnpm install --frozen-lockfile` and typechecks the client from `client/`.

- [x] **Step 1: Pin pnpm and Node versions**

Use `pnpm/action-setup` v6.1.0 with `version: 12.3.4`, and configure `actions/setup-node` to read `.node-version` while caching both package-local lockfiles.

- [x] **Step 2: Replace root install and filter commands**

Run one frozen install in `client/`, one in `server/`, and run client typecheck with `working-directory: client` and `pnpm exec tsc --noEmit`.

- [x] **Step 3: Validate workflow structure**

Run:

```powershell
git diff --check -- .github/workflows/copilot-setup-steps.yml
```

Expected: no whitespace errors and no root `pnpm install` or `pnpm --filter` command remains in the active workflow.

### Task 2: Align repository instructions with independent packages

**Files:**
- Modify: `.github/copilot-instructions.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: The package-local scripts in `client/package.json` and `server/package.json`.
- Produces: Consistent instructions using `pnpm --dir client ...` and `pnpm --dir server ...`.

- [x] **Step 1: Replace root and filter setup commands**

Document separate installs and separate development terminals. Use `pnpm --dir client` for client typecheck/build/lint/test and `pnpm --dir server` for server typecheck/build/lint.

- [x] **Step 2: Verify no active instruction points to the deleted root package**

Run:

```powershell
git grep -n -I -E 'pnpm --filter|pnpm (install|start|dev) \(root\)|pnpm install$' -- .github/copilot-instructions.md CLAUDE.md
```

Expected: no stale root-workspace command remains in either active instruction file.

### Task 3: Remove redundant root package metadata

**Files:**
- Delete: `package.json`
- Delete: `pnpm-lock.yaml`
- Delete: `pnpm-workspace.yaml`

**Interfaces:**
- Consumes: Package-local manifests and lockfiles already used by CI and Vercel.
- Produces: A repository root that is a non-package container; `pnpm --dir client ...` and `pnpm --dir server ...` remain the supported commands.

- [x] **Step 1: Delete only the redundant root package files**

Do not delete `.node-version`, `.gitignore`, `client/package.json`, `client/pnpm-lock.yaml`, `client/pnpm-workspace.yaml`, `server/package.json`, `server/pnpm-lock.yaml`, `server/pnpm-workspace.yaml`, or `server/api/package.json`.

- [x] **Step 2: Confirm active CI and Vercel references stay package-local**

Run:

```powershell
git grep -n -I -E 'cache-dependency-path|working-directory: (client|server)|installCommand|pnpm-lock.yaml' -- .github/workflows client/vercel.json server/vercel.json docs/DEVELOPMENT.md docs/ci-cd.md
```

Expected: CI caches and installs `client/pnpm-lock.yaml` and `server/pnpm-lock.yaml`; Vercel install commands are evaluated from their configured project roots.

### Task 4: Update wiki record and verify the branch

**Files:**
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Interfaces:**
- Consumes: The completed package-boundary change.
- Produces: A dated, concise record that root dependency resolution was removed.

- [x] **Step 1: Bump the wiki date and append one log entry**

Set `Wiki/index.md`'s `Last updated` date to `2026-09-08` and append one factual line to `Wiki/log.md` describing removal of root pnpm metadata and preservation of package-local lockfiles.

- [x] **Step 2: Run package-local frozen-lockfile checks**

Run:

```powershell
pnpm --dir client install --lockfile-only --frozen-lockfile --ignore-scripts --reporter append-only
pnpm --dir server install --lockfile-only --frozen-lockfile --ignore-scripts --reporter append-only
```

Expected: both commands exit 0 using pnpm 12.3.4.

- [x] **Step 3: Run relevant quality checks**

Run:

```powershell
client\node_modules\.bin\tsc.cmd -p client\tsconfig.json --noEmit
pnpm --dir client build
pnpm --dir client lint
pnpm --dir server typecheck
pnpm --dir server build
pnpm --dir server lint
git diff --check
```

Expected: all commands pass; any pre-existing warnings are reported without broadening the change.

- [x] **Step 4: Review final scope**

Run:

```powershell
git status --short
git diff --stat
git diff --name-status
```

Expected: the planned workflow/instruction/wiki changes, the plan, three root package-file deletions, and removal of the tracked pnpm cache are present; no `.env`, local cache data, or unrelated source changes are included.

### Task 5: Remove no-op security workflow triggers

**Files:**
- Modify: `.github/workflows/security.yml`

**Interfaces:**
- Consumes: The existing pull-request-only dependency review job.
- Produces: A security workflow that runs only on the event supported by its job instead of creating skipped push and scheduled runs.

- [x] **Step 1: Keep dependency review on pull requests only**

Remove the `push` and `schedule` triggers because the only job is guarded by `github.event_name == 'pull_request'`; retain the `pull_request` trigger for `main`.

- [x] **Step 2: Validate the workflow trigger and action pins**

Run:

```powershell
rg -n 'pull_request|push:|schedule:|dependency-review-action@' .github/workflows/security.yml
```

Expected: `pull_request` and the pinned dependency-review action are present; `push:` and `schedule:` are absent.
