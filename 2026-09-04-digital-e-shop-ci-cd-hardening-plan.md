# Digital-E Shop CI/CD Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Digital-E Shop CI/CD so pull requests and production releases are validated against a real MySQL database, Prisma migrations, security checks, and controlled deployment gates before code reaches production.

**Architecture:** Keep the existing lightweight GitHub Actions split between client and server, then add a database-backed server integration gate, security scanning, and explicit deployment verification. Vercel remains the hosting platform, but production deployment must no longer be treated as independent from CI success. The design favors reproducibility, least privilege, small workflows, and testable incremental PRs rather than a large enterprise pipeline.

**Tech Stack:** GitHub Actions, Node.js 24, pnpm 11.5.3, TypeScript, React/Vite, NestJS/Node backend, MySQL 8.4, Prisma 7.x, Vitest, Vercel, Dependabot, GitHub CodeQL.

**Spec:** Audit findings are embedded in this document under **CI/CD Audit Findings** and are based on the current `main` workflow configuration reviewed on 2026-09-04.

## Global Constraints

- Runtime version must remain Node.js `24.x`.
- Package manager must remain `pnpm@11.5.3`.
- Dependency installation must use `pnpm install --frozen-lockfile`.
- Production database migrations must use committed Prisma migration history, not `prisma db push`.
- CI jobs should use least-privilege GitHub permissions.
- CI must not require production credentials for unit tests.
- Secrets must only be injected into jobs that actually need them.
- Production deployment must not be considered successful until post-deploy smoke checks pass.
- Do not add unnecessary infrastructure such as Kubernetes, self-hosted runners, or a separate CI platform.
- Prefer small, independently reviewable PRs and frequent commits.

---

# CI/CD Audit Findings

## Current pipeline

The primary CI workflow currently performs:

```text
Pull Request / Push to main
           |
      +----+----+
      |         |
   Client     Server
      |         |
   install    install
   typecheck  typecheck
   lint       lint
   test       test
   build      build
```

Strengths already present:

- `pull_request` and `push` validation for `main`.
- Separate client and server jobs.
- `pnpm install --frozen-lockfile`.
- Node.js 24 in the main CI workflow.
- Typecheck, lint, tests, and build for both applications.
- `concurrency` with `cancel-in-progress: true`.
- GitHub job permissions restricted to `contents: read`.
- Dependabot is configured for npm and GitHub Actions.

## Risk summary

| Priority | Finding | Risk |
|---|---|---|
| P0 | Server CI declares a localhost MySQL URL but does not start MySQL | High |
| P0 | Vercel deployment is not explicitly gated behind GitHub CI | High |
| P1 | No real database-backed integration gate | High |
| P1 | Prisma migrations are not validated in CI | High |
| P1 | No dedicated SAST/security workflow | Medium-High |
| P1 | GitHub Actions are referenced by mutable version tags | Medium |
| P1 | Copilot setup injects a real DB secret into a workflow that does not need it | Medium |
| P2 | Copilot workflow runs Node.js 22 while the repository requires Node.js 24 | Medium |
| P2 | Copilot client typecheck uses `continue-on-error: true` | Medium |
| P2 | Runner uses `ubuntu-latest` instead of a fixed runner image | Low-Medium |
| P2 | CI does not preserve build/test artifacts | Low |
| Unknown | Branch protection / required check policy could not be verified | Needs repository setting review |

---

# Target CI/CD Architecture

```text
                         Pull Request
                              |
             +----------------+----------------+
             |                                 |
         Client CI                         Server CI
             |                                 |
         typecheck                          typecheck
         lint                               lint
         unit tests                         unit tests
         build                              build
             |                                 |
             +----------------+----------------+
                              |
                    DB Integration Gate
                              |
                         MySQL 8.4
                              |
                    Prisma migrate deploy
                              |
                    Prisma migrate status
                              |
                     integration tests
                              |
                       Security Gates
                              |
                    CodeQL / dependency
                              |
                    Preview Deployment
                              |
                      reviewer validation
                              |
                            MERGE
                              |
                            main
                              |
                       Main CI re-run
                              |
                  Production deployment
                              |
                    Post-deploy smoke test
                              |
                         RELEASE OK
```

---

# File Structure

## Existing files to modify

- `.github/workflows/ci.yml`
  - Main client/server CI.
  - Add MySQL service, migration validation, and integration test gate.
  - Pin runtime and runner configuration.

- `.github/workflows/copilot-setup-steps.yml`
  - Align Node.js runtime.
  - Remove unnecessary database secret exposure.
  - Remove misleading soft-failure typecheck behavior.

- `.github/dependabot.yml`
  - Keep the current grouped npm strategy.
  - Ensure GitHub Actions dependency updates remain enabled after immutable SHA pinning.

- `server/package.json`
  - Reuse or add explicit migration/integration commands only if the repository does not already expose them.

## Files to create

- `.github/workflows/security.yml`
  - CodeQL and dependency-oriented security checks.

- `.github/workflows/deploy.yml`
  - Optional explicit production deployment gate if Vercel Git Integration cannot be configured to wait for CI.

- `server/src/**/__tests__/*.integration.test.ts`
  - Database-backed integration tests for critical persistence behavior.

- `docs/ci-cd.md`
  - Document CI responsibilities, required checks, deployment flow, environment separation, and failure recovery.

---

# Task 1: Add a Real MySQL Service to Server CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify only if needed: `server/package.json`

**Interfaces:**
- Consumes: current server `typecheck`, `lint`, `test`, and `build` scripts.
- Produces: a healthy MySQL 8.4 service available at `127.0.0.1:3306` with database `digital_e_shop_ci`.

- [ ] **Step 1: Add the MySQL service to the server job**

```yaml
server:
  runs-on: ubuntu-24.04

  permissions:
    contents: read

  services:
    mysql:
      image: mysql:8.4
      env:
        MYSQL_ROOT_PASSWORD: root
        MYSQL_DATABASE: digital_e_shop_ci
        MYSQL_USER: ci_user
        MYSQL_PASSWORD: ci_password
      ports:
        - 3306:3306
      options: >-
        --health-cmd="mysqladmin ping -h 127.0.0.1 -uci_user -pci_password"
        --health-interval=10s
        --health-timeout=5s
        --health-retries=10

  env:
    DATABASE_URL: "mysql://ci_user:ci_password@127.0.0.1:3306/digital_e_shop_ci"
```

- [ ] **Step 2: Keep dependency installation deterministic**

```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```

Expected: CI fails if manifests and lockfile diverge.

- [ ] **Step 3: Verify real MySQL connectivity**

```yaml
- name: Verify MySQL connectivity
  run: |
    node -e "
      const mysql = require('mysql2/promise');
      mysql.createConnection(process.env.DATABASE_URL)
        .then(async connection => {
          await connection.query('SELECT 1');
          await connection.end();
          console.log('MySQL connection OK');
        })
        .catch(error => {
          console.error(error);
          process.exit(1);
        });
    "
```

Expected:

```text
MySQL connection OK
```

- [ ] **Step 4: Run workflow on a feature PR**

Expected:

```text
mysql service: healthy
Install dependencies: PASS
Verify MySQL connectivity: PASS
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add mysql service for server validation"
```

---

# Task 2: Validate Prisma Migration History in CI

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify only if required: `server/package.json`
- Read: `server/src/database/prisma/migrations/`

**Interfaces:**
- Consumes: MySQL service from Task 1 and current Prisma migration history.
- Produces: a clean database schema built only from committed migrations.

- [ ] **Step 1: Confirm migration scripts**

Desired scripts:

```json
{
  "scripts": {
    "prisma:migrate:deploy": "prisma migrate deploy",
    "prisma:migrate:status": "prisma migrate status"
  }
}
```

If equivalent commands already exist, reuse them.

- [ ] **Step 2: Apply migrations**

```yaml
- name: Apply Prisma migrations
  run: pnpm --filter server prisma:migrate:deploy
```

- [ ] **Step 3: Verify migration status**

```yaml
- name: Verify Prisma migration status
  run: pnpm --filter server prisma:migrate:status
```

Expected: no pending or failed migrations.

- [ ] **Step 4: Prove a broken migration fails CI**

On a disposable branch, add an intentionally invalid migration and run CI.

Expected:

```text
Apply Prisma migrations: FAIL
```

Revert the disposable migration immediately.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml server/package.json
git commit -m "ci: validate prisma migrations against mysql"
```

---

# Task 3: Add Database-Backed Integration Tests

**Files:**
- Create or extend focused files under:
  - `server/src/orders/__tests__/`
  - `server/src/inventory/__tests__/`
  - `server/src/auth/__tests__/`
- Modify: `.github/workflows/ci.yml`
- Modify only if needed: `server/package.json`

**Interfaces:**
- Consumes: migrated MySQL database from Task 2.
- Produces: integration coverage for real repository/database behavior without mocking persistence.

## Minimum critical coverage

1. Authentication persistence.
2. Order ownership enforcement.
3. Checkout/order idempotency.
4. Inventory persistence.
5. Prisma transaction behavior.

- [ ] **Step 1: Add an explicit integration test script**

Preferred:

```json
{
  "scripts": {
    "test:integration": "vitest run --config vitest.config.ts --testNamePattern=integration"
  }
}
```

If the repository already has an integration-test convention, preserve it.

- [ ] **Step 2: Add a real database test for ownership**

Insert two customers and one order owned by customer A, then query as customer B.

Conceptual assertion:

```ts
expect(
  await orderService.getOrderForCustomer(orderId, customerB.id),
).rejects.toThrow();
```

Persistence must execute against MySQL rather than a mocked repository.

- [ ] **Step 3: Add an idempotency persistence test**

Create the same logical checkout twice using the same idempotency identifier.

Expected:

```ts
expect(secondAttempt).toResolveToTheExistingCheckout();
```

Database state must contain exactly one persisted checkout/session record.

- [ ] **Step 4: Add an inventory persistence test**

Create inventory, apply a mutation, reload from MySQL, and assert persisted state.

- [ ] **Step 5: Run locally**

```bash
pnpm --filter server test:integration
```

Expected: PASS.

- [ ] **Step 6: Add to CI**

```yaml
- name: Integration tests
  run: pnpm --filter server test:integration
```

- [ ] **Step 7: Commit**

```bash
git add server .github/workflows/ci.yml
git commit -m "test: add mysql-backed integration coverage"
```

---

# Task 4: Harden the Existing CI Workflow

**Files:**
- Modify: `.github/workflows/ci.yml`
- Review: `.github/dependabot.yml`

**Interfaces:**
- Produces: more reproducible runner/runtime/action behavior.

- [ ] **Step 1: Pin runner image**

Replace:

```yaml
runs-on: ubuntu-latest
```

with:

```yaml
runs-on: ubuntu-24.04
```

- [ ] **Step 2: Keep Node.js 24 everywhere**

```yaml
- uses: actions/setup-node@v7
  with:
    node-version: 24
    cache: pnpm
```

- [ ] **Step 3: Pin actions to immutable SHAs**

Replace:

```yaml
uses: actions/checkout@v7
```

with:

```yaml
uses: actions/checkout@<full-reviewed-commit-sha> # v7.x.x
```

Do the same for:

```text
actions/checkout
actions/setup-node
pnpm/action-setup
```

Use the exact upstream SHA for the reviewed release; do not invent SHAs.

- [ ] **Step 4: Keep GitHub Actions Dependabot enabled**

The existing `github-actions` ecosystem should remain enabled so Dependabot can update pinned SHAs.

- [ ] **Step 5: Preserve least privilege**

Keep:

```yaml
permissions:
  contents: read
```

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/dependabot.yml
git commit -m "ci: harden action and runner reproducibility"
```

---

# Task 5: Remove Unnecessary Secrets from Copilot Setup

**Files:**
- Modify: `.github/workflows/copilot-setup-steps.yml`

**Interfaces:**
- Produces: a setup workflow that does not expose a real DB credential unnecessarily.

- [ ] **Step 1: Change Node.js 22 to 24**

```yaml
node-version: 24
```

- [ ] **Step 2: Remove the real database secret**

Remove:

```yaml
DATABASE_URL: ${{ secrets.COPILOT_MCP_MYSQL_URL }}
```

Use a non-secret placeholder where only config presence is needed:

```yaml
- name: Create server env file
  run: |
    echo "DATABASE_URL=mysql://placeholder:placeholder@127.0.0.1:3306/placeholder" > server/.env
    echo "JWT_SECRET_KEY=test-secret-for-agent-sandbox" >> server/.env
    echo "JWT_REFRESH_SECRET_KEY=test-refresh-secret-for-agent-sandbox" >> server/.env
```

- [ ] **Step 3: Remove misleading soft failure**

Remove:

```yaml
continue-on-error: true
```

Preferred:

```yaml
- name: Typecheck client
  run: pnpm --filter client exec tsc --noEmit
```

- [ ] **Step 4: Run via `workflow_dispatch`**

Expected: install, setup, and typecheck all pass without a real DB secret.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/copilot-setup-steps.yml
git commit -m "ci: harden copilot setup environment"
```

---

# Task 6: Add CodeQL Security Scanning

**Files:**
- Create: `.github/workflows/security.yml`

**Interfaces:**
- Produces: SAST validation for JavaScript/TypeScript.

- [ ] **Step 1: Create CodeQL workflow**

```yaml
name: Security

on:
  pull_request:
    branches:
      - main
  push:
    branches:
      - main
  schedule:
    - cron: "0 20 * * 0"

permissions:
  contents: read
  security-events: write

jobs:
  codeql:
    runs-on: ubuntu-24.04

    steps:
      - name: Checkout
        uses: actions/checkout@<reviewed-sha>

      - name: Initialize CodeQL
        uses: github/codeql-action/init@<reviewed-sha>
        with:
          languages: javascript-typescript

      - name: Autobuild
        uses: github/codeql-action/autobuild@<reviewed-sha>

      - name: Analyze
        uses: github/codeql-action/analyze@<reviewed-sha>
```

- [ ] **Step 2: Verify minimal permissions**

Do not grant `contents: write`, `actions: write`, or `pull-requests: write`.

- [ ] **Step 3: Open a PR and verify**

Expected:

```text
Security / codeql: PASS
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci: add codeql security scanning"
```

---

# Task 7: Add Dependency Security Review

**Files:**
- Modify: `.github/workflows/security.yml`

**Interfaces:**
- Produces: a dependency-risk gate for pull requests.

- [ ] **Step 1: Add dependency review**

```yaml
dependency-review:
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-24.04
  permissions:
    contents: read

  steps:
    - name: Checkout
      uses: actions/checkout@<reviewed-sha>

    - name: Dependency review
      uses: actions/dependency-review-action@<reviewed-sha>
      with:
        fail-on-severity: high
```

- [ ] **Step 2: Verify a normal dependency PR**

Expected:

```text
dependency-review: PASS
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/security.yml
git commit -m "ci: add dependency security review"
```

---

# Task 8: Gate Production Deployment Behind CI

**Files:**
- Review Vercel settings for `digital-e-shop` and `digital-e-server`
- Create only if necessary: `.github/workflows/deploy.yml`
- Create/modify: `docs/ci-cd.md`

**Interfaces:**
- Consumes: successful CI/security checks on `main`.
- Produces: controlled production deployment and post-deploy smoke verification.

## Required behavior

```text
merge main
   |
main CI
   |
security
   |
deploy
   |
smoke checks
   |
release success
```

Do not allow production to logically race independently against CI.

- [ ] **Step 1: Inspect Vercel Git deployment settings**

Prefer Vercel/GitHub integration gating over long-lived deployment tokens.

- [ ] **Step 2: Require core checks**

At minimum:

```text
CI / client
CI / server
Security / codeql
Security / dependency-review
```

where supported.

- [ ] **Step 3: If necessary, create explicit deployment workflow**

Use a controlled `workflow_run` or equivalent main-only release trigger.

- [ ] **Step 4: Add frontend smoke check**

```bash
curl --fail --silent --show-error https://digital-e.vercel.app/
```

- [ ] **Step 5: Add backend health check**

```bash
curl --fail --silent --show-error https://<server-domain>/api/health
```

Expected: healthy JSON response.

Do not treat Vercel `READY` alone as proof that the application is healthy.

- [ ] **Step 6: Document rollback**

```text
If deployment smoke checks fail:
1. Mark release unsuccessful.
2. Do not blindly apply another database migration.
3. Roll back/re-promote the last known-good Vercel deployment where safe.
4. Open a hotfix PR.
5. Re-run CI and smoke validation.
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/deploy.yml docs/ci-cd.md
git commit -m "ci: gate production deployment and add smoke checks"
```

If no custom deploy workflow is needed, commit only repository documentation/config changes.

---

# Task 9: Configure Main Branch Protection

**Files:**
- Repository settings
- Document: `docs/ci-cd.md`

**Interfaces:**
- Consumes: CI/security status checks.
- Produces: enforcement against unvalidated changes entering `main`.

- [ ] **Step 1: Require pull requests**

Enable:

```text
Require a pull request before merging
```

For a solo-maintainer repository, mandatory approval count can remain `0`.

- [ ] **Step 2: Require status checks**

At minimum:

```text
CI / client
CI / server
Security / codeql
```

Add dependency review if GitHub exposes it as a stable required check.

- [ ] **Step 3: Require branch to be up to date**

Enable if compatible with the preferred merge workflow.

- [ ] **Step 4: Block force pushes and deletion**

Enable:

```text
Block force pushes
Block deletion
```

for `main`.

- [ ] **Step 5: Verify protection**

Attempt to merge a failing PR.

Expected: GitHub blocks the merge.

- [ ] **Step 6: Document exact rules**

Record enabled rules in `docs/ci-cd.md`.

---

# Task 10: Add CI/CD Documentation

**Files:**
- Create: `docs/ci-cd.md`

**Interfaces:**
- Produces: operational source of truth for maintainers and AI agents.

- [ ] **Step 1: Document workflow responsibilities**

```text
ci.yml
- typecheck
- lint
- unit tests
- migration validation
- integration tests
- build

security.yml
- CodeQL
- dependency review

deploy.yml / Vercel integration
- production deployment
- smoke verification
```

- [ ] **Step 2: Document environment boundaries**

```text
CI credentials:
- disposable
- non-production
- safe test literals where appropriate

Production secrets:
- secret/environment store only
- never committed
- never injected into ordinary PR CI
```

- [ ] **Step 3: Document local parity commands**

```bash
pnpm install --frozen-lockfile

pnpm --filter client exec tsc --noEmit
pnpm --filter client lint
pnpm --filter client test -- --run
pnpm --filter client build

pnpm --filter server typecheck
pnpm --filter server lint
pnpm --filter server test -- --run
pnpm --filter server prisma:migrate:deploy
pnpm --filter server prisma:migrate:status
pnpm --filter server test:integration
pnpm --filter server build
```

- [ ] **Step 4: Add production release checklist**

```markdown
## Production Release Checklist

- [ ] PR CI is green.
- [ ] Security checks are green.
- [ ] Prisma migration review completed.
- [ ] PR merged to `main`.
- [ ] Main branch CI is green.
- [ ] Production deploy succeeded.
- [ ] Frontend smoke check passed.
- [ ] Backend health check passed.
- [ ] Critical checkout/login flow has no new production error.
```

- [ ] **Step 5: Commit**

```bash
git add docs/ci-cd.md
git commit -m "docs: document ci cd release process"
```

---

# Recommended PR Breakdown

## PR 1 — Database-aware CI

Scope:

- Task 1
- Task 2

Outcome:

```text
Server CI proves that MySQL starts and Prisma migrations work.
```

## PR 2 — Integration coverage

Scope:

- Task 3

Outcome:

```text
Critical persistence flows execute against real MySQL.
```

## PR 3 — Workflow hardening

Scope:

- Task 4
- Task 5

Outcome:

```text
Runtime consistency improves and unnecessary secret exposure is removed.
```

## PR 4 — Security gates

Scope:

- Task 6
- Task 7

Outcome:

```text
PRs gain CodeQL and dependency security checks.
```

## PR 5 — Production deployment gate

Scope:

- Task 8
- Task 9
- Task 10

Outcome:

```text
Production release is tied to validated CI and smoke checks.
```

---

# Verification Matrix

| Control | Verification | Expected |
|---|---|---|
| Frozen dependencies | Run CI with stale lockfile | Install fails |
| MySQL availability | Server job health check | PASS |
| Migration correctness | `prisma migrate deploy` | PASS |
| Migration state | `prisma migrate status` | Clean |
| Unit tests | Client/server test jobs | PASS |
| Real DB integration | Integration suite | PASS |
| Type safety | Client/server typecheck | PASS |
| Static quality | Client/server lint | PASS |
| Build | Client/server build | PASS |
| SAST | CodeQL | PASS |
| Dependency security | Dependency review | No high severity block |
| Production frontend | HTTP smoke test | 2xx |
| Production server | `/api/health` | Healthy |
| Branch safety | Try merging failing PR | Blocked |

---

# Definition of Done

- [ ] `main` cannot receive an unvalidated PR under normal repository policy.
- [ ] Server CI starts an isolated MySQL 8.4 instance.
- [ ] Prisma migrations are applied to a clean CI database on relevant PRs.
- [ ] Migration status is verified.
- [ ] Critical persistence paths have real database-backed integration tests.
- [ ] Client/server unit, typecheck, lint, and build gates remain green.
- [ ] Node.js 24 is used consistently across primary automation.
- [ ] Copilot setup does not require a production-like database credential.
- [ ] GitHub Actions are pinned to reviewed immutable SHAs.
- [ ] CodeQL runs on PRs and `main`.
- [ ] Dependency review blocks high-severity dependency regressions.
- [ ] Production deployment is gated by validated CI/security state.
- [ ] Frontend and backend production smoke checks run after deployment.
- [ ] `main` blocks force pushes and unsafe merge paths.
- [ ] CI/CD and rollback procedures are documented.

---

# Expected Maturity After Implementation

Current approximate maturity:

```text
6.5 / 10
```

Expected after Tasks 1-10:

```text
8.5 - 9 / 10
```

The remaining gap is intentional. For the current scale of Digital-E Shop, Kubernetes, multi-region release orchestration, self-hosted runners, complex artifact promotion, and enterprise policy tooling would add operational complexity without proportional value.
