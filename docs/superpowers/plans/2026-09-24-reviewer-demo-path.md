# Reviewer Demo Path Implementation Plan

> **For agentic workers:** Execute this plan inline, one task at a time. Preserve unrelated working-tree changes.

**Goal:** Give a reviewer a concise path through one real Digital-E customer order and connect its product behavior to safe k6 and OpenTelemetry evidence.

**Architecture:** Add a short reviewer guide linked near the top of the README. Use the existing local development profile, guest checkout, read-only k6 smoke scenario, and opt-in OTLP instrumentation; do not add a permanent browser test harness or observability service.

**Tech Stack:** Markdown, existing React storefront and NestJS API, Playwright installed only in a temporary directory for this one-off run, k6, OpenTelemetry OTLP.

## Global Constraints

- Preserve the active branch and all pre-existing work. Do not merge, reset, or rebase. The user later authorized staging, committing, and pushing this completed change set.
- Create one COD order only in the documented disposable local/test database; use synthetic contact details.
- Keep the k6 run read-only and bounded by the existing smoke profile; never point it at production.
- Keep telemetry disabled by default and use only an approved local/test OTLP collector; do not record credentials, guest access tokens, or personal data in screenshots.
- Add no package dependency, persistent Playwright configuration, CI job, or dashboard infrastructure.
- Report browser, k6, and OTel results only when fresh output proves them; name any environment blocker explicitly.

---

### Task 1: Add the reviewer walkthrough

**Files:**
- Create: `docs/DEMO.md`
- Modify: `README.md`

**Interfaces:**
- `README.md` links to the reviewer guide.
- The guide links to `docs/DEVELOPMENT.md`, `docs/TESTING.md`, and `server/test/README-k6.md` for setup and detailed operations.

- [x] **Step 1: Write the guest customer path** with the actual storefront, cart, checkout, confirmation, and guest-order lookup routes; state the isolated database and synthetic data preconditions before the single COD write.
- [x] **Step 2: Explain the evidence chain**: browser assertions prove the shopper outcome, k6 measures bounded read-only health/catalog contracts and latency, and OpenTelemetry traces/metrics plus trace-correlated logs expose server and MySQL behavior.
- [x] **Step 3: Include only measured run facts**. Identify environment, profile, duration, VUs, checks, request failures, and p95 from fresh command output; avoid capacity or SLO claims.
- [x] **Step 4: Add a prominent README link** and keep the existing project summary and environment setup accurate.
- [x] **Step 5: Run `git diff --check`** and review the exact documentation diff for placeholders, unsupported claims, unsafe targets, and accidental edits.

### Task 2: Prove the guest COD flow in a real browser

**Files:**
- Create only after successful verification: `docs/assets/demo/guest-order-confirmed.png`
- Temporary only: Playwright package and one-off runner under the system temp directory; no repository package/config changes.

**Interfaces:**
- Use the already-running client/API at the documented local addresses and the disposable local MySQL profile.
- Use the existing guest cart, COD checkout, success, and guest lookup contracts.

- [x] **Step 1: Confirm** the client, API health route, seeded catalog, and disposable database are reachable; stop before any write if the target cannot be identified as local/test.
- [x] **Step 2: Run Playwright in installed Microsoft Edge** from a temporary pnpm directory; open the storefront, choose an in-stock seeded product, add it to the guest cart, and verify cart totals.
- [x] **Step 3: Complete one COD order** with synthetic contact details; verify the confirmation page contains the order outcome and the guest lookup can retrieve it with its access token.
- [x] **Step 4: Capture a reviewer screenshot** with order identifiers, access token, and contact fields masked; record browser size and the tested routes in `docs/DEMO.md`.
- [x] **Step 5: Close the browser and remove only the temporary runner/profile** created for this task.

### Task 3: Capture safe performance and trace evidence

**Files:**
- Modify: `docs/DEMO.md`
- Create only after successful verification: `docs/assets/demo/otel-trace-evidence.png`

**Interfaces:**
- Run the existing `pnpm --dir server perf:smoke` launcher against `http://127.0.0.1:4000` and its disposable seeded catalog.
- Configure the existing API OpenTelemetry exporter with a local OTLP/HTTP collector; do not change tracked runtime defaults.

- [x] **Step 1: Run the bounded read-only k6 smoke profile** and capture its actual VUs, duration, checks, HTTP failure rate, and p95; preserve the configured thresholds.
- [x] **Step 2: Enable OpenTelemetry only for the local API session** and confirm exported HTTP/Express and MySQL2 spans appear in the approved collector for read-only health/catalog requests.
- [x] **Step 3: Capture a trace view** without tokens or contact data and describe how to correlate it with the request log's trace ID.
- [x] **Step 4: Update the guide** with measured results, collector access steps, and the limitation that the k6 smoke profile is a low-load contract check rather than a capacity benchmark.
- [x] **Step 5: Review** with `git diff --check`, fresh k6/browser/trace output, and a final worktree check; report any evidence that could not be collected because services are unavailable.
