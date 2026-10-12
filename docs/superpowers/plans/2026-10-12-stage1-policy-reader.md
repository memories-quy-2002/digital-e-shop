# Stage 1 separate policy-reader implementation plan

**Goal:** Read current required-check policy with a dedicated read-only App token before the Actions token updates the approved Check Run.

**Architecture:** The protected `publish` job mints a repository-scoped read-only installation token using the pinned official action. The Node publisher routes that token through an observe-only transport and the Actions token through an exact-PATCH-only transport. PR code, artifacts, and credentials never cross into the trusted publisher checkout.

**Scope:** `scripts/loop/stage1-check-run-publisher.mjs`, its tests, `.github/workflows/stage1-trusted-retry.yml`, workflow contract tests, Stage 1 guides and Wiki. Preserve the existing flaky classifier, approvals, budgets, original required identity, and no-push/no-merge authority.

**Acceptance criteria:**
- AC1: Read and write tokens are separate; missing or equal tokens refuse before API access.
- AC2: Read transport cannot PATCH; write transport cannot read policy or perform another write.
- AC3: Missing/expired policy credentials, changed policy, incomplete evidence, or changed PR tuple produce zero PATCH requests.
- AC4: Only the protected publisher references policy-reader credentials; token scope is one repository, all requested permissions are read-only, and post-job revocation remains enabled.
- AC5: Hosted CI is reported for its exact tested SHA; it cannot certify uncommitted changes. Human review, reviewed merge, live credentials, selected eligible PR, and ten representative observations remain explicit gates.

**Tasks:**
- [x] Add regression tests for transports, credential separation, expired credentials, and workflow isolation; run them red.
- [x] Add observe/publish transport capabilities and separate CLI policy token; pin the token action and wire the protected publisher; run targeted tests green.
- [x] Review the diff, run all Loop tests and diff checks, and update the maintained guides.
- [x] Record live PR/CI evidence, credential availability and remaining pilot gates without secrets or fabricated observations.

**Verification:** `node --test scripts/loop/__tests__/*.test.mjs`; `git diff --check`; fresh read-only PR/check/review observations. Node available locally is 24.21.0; the repository/workflow pin remains 24.20.0. Full hosted CI and a real pilot cannot be claimed from fixtures.

**Execution:** Native implementation in the current feature branch, as authorized by the maintainer's request to perform the five steps. Source publication targets only `feature/stage1-trusted-dispatch` after local tests and review; merge, App settings, protected-environment configuration and live TTY approval remain separate human gates.

**Local result:** 405 Loop tests passed (31 suites), diff check passed, and independent read-only code review found no findings. Hosted CI must separately validate the published revision; no live pilot or promotion observation has been collected.
