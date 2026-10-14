# Implementation Plan: Local Loop Runner with Codex App Server

**Goal:** Replace the unprovisioned Issue-task Queue-to-runner-service dispatch with an authenticated local Loop runner that polls Cloudflare, runs the existing bounded task lifecycle on this machine, and uses Codex App Server with the user's ChatGPT plan and GPT-6-Luna. Keep the task container isolated, keep GitHub delivery human-controlled, and do not add an OpenAI API fallback.

**Architecture:** Cloudflare D1 remains authoritative for TaskRecords, canonical policy, leases, deadlines, and transitions. A single local runner process polls a narrow authenticated Worker API over outbound HTTPS. Cloudflare revalidates the task and claims the lease before returning a bounded packet. The host re-observes the Issue and canonical policy, coordinates the existing task runtime, Docker adapter, verifier, and delivery state. The host talks to a local Codex App Server subprocess over bounded JSON-RPC; the task container receives model requests only through the existing stdio bridge and stays network-disabled. A Windows startup task launches the runner under a dedicated local OS identity and waits for Docker readiness. Existing PR-event/Stage 0 queues remain unchanged.

**Tech Stack:** Node.js 24, ESM, TypeScript 6 Cloudflare Worker, Cloudflare D1, Docker, Codex CLI App Server, Windows Task Scheduler, pnpm, Node test runner, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-14-codex-cli-runner-design.md`

**Global Constraints:**

- Never send an actual model request in implementation or automated tests. Use fake OAuth, fake App Server, and fake model responses. No API-key provider or fallback.
- Keep `.agent/policy/autonomy.yml` disabled and auto-merge disabled. Its provider migration is a separate reviewed policy change; after that policy revision is merged, begin a fresh run before any autonomous task is dispatched. Do not edit policy and then run a task under the changed policy.
- Keep the task container `--network none`, read-only source mount, dropped capabilities, and no credentials. The host's Codex OAuth and runner-control credential must never enter container arguments, environment, files, logs, TaskRecord, or LoopState.
- Keep canonical policy, Issue eligibility/digest, exact path scope, budgets, lease/version checks, and fixed verification authoritative. Unknown token usage under an enabled token cap fails closed. Never weaken checks or widen protected paths.
- Preserve human approval for high-risk work, GitHub writes, push, merge, deployment, and production actions. Critical paths/actions remain non-executable.
- Use one local task at a time. The original Cloudflare deadline continues while the computer is off or asleep; offline time does not extend it. Never claim an expired task.
- If ChatGPT-plan App Server access for this local/private integration, GPT-6-Luna availability, or the Windows/Docker startup identity cannot be verified, stop at that prerequisite and report the blocker. Do not substitute API billing, another model, another host, or weaker isolation.
- Use pnpm only. Update `AGENTS.md`, the relevant Loop docs, and Wiki architecture knowledge. Do not call external model, GitHub write, push, deploy, or merge operations.

**Review Focus:** OAuth expiry/refresh and account eligibility; App Server protocol framing, process failure, and bounded output; authentication and repository scoping of runner-control endpoints; duplicate, stale, replayed, expired, and lease-lost task claims; TaskRecord compare-and-save under lease; no credential or network path into Docker; startup behavior when Docker is unavailable; no change to PR babysitter queue behavior; disabled canonical policy and no migration bypass.

## Task 1: Validate runtime prerequisites and freeze the provider contract

Before implementation, confirm the approved integration can run on the target machine without invoking a model. Read the spec and the official Codex App Server/Sign in with ChatGPT documentation; inspect the installed `codex` App Server protocol and model catalog; verify that GPT-6-Luna is exposed for the signed-in plan. Validate the intended dedicated Windows account can start the Docker engine and run the repository's required container isolation after machine startup. Record pass/fail and exact versions in `docs/loop-engineering/codex-runner-readiness.md`.

Use only non-generative probes and fake requests. Do not print or persist OAuth tokens, account identifiers, or raw environment data. If plan eligibility is unavailable or ambiguous, or Docker isolation is unavailable to the startup identity, stop implementation and report the specific blocker for a design decision.

**Acceptance:** Readiness report contains only versions, capability results, and safe reason codes; no credentials or personal account data. No actual inference request occurred. Docker can enforce `--network none`, read-only source, dropped capabilities, and the configured resource limits under the startup identity.

## Task 2: Add protected ChatGPT-plan authorization and credential lifecycle

Implement the host-only OAuth flow and credential store. Define a small injectable interface in `scripts/loop/runner/chatgpt-plan-auth.mjs`:

```js
createChatGptPlanAuth({ credentialStore, fetchImpl, browser, now, callbackServer })
// authorize(), getAccessToken(), status(), clear()
```

Store only the App Server-required OAuth fields and host identifier in a dedicated runner user's profile, with filesystem ACL restricted to that identity and atomic writes. Keep refresh and expiry handling in the host process. Return redacted status; never expose tokens through CLI output. The separate Cloudflare runner-control bearer credential is stored through the same protected store under a distinct key and can be replaced independently. Do not read or copy Codex CLI's general login database.

Add tests in `scripts/loop/__tests__/runner-chatgpt-plan-auth.test.mjs` for fake authorization success, denied/unsupported account, expired access token refresh, invalid refresh, missing scopes, host identity persistence, atomic-store failure, clear, and redacted output. Verify token material never appears in errors or logs. Add a short operator guide for initial sign-in and credential rotation in `docs/loop-engineering/task-runner.md`.

**Acceptance:** All auth tests use injected fake HTTP/browser/callback implementations. Credentials are host-only, protected by the runner account ACL, and absent from task/container interfaces. Unsupported plan authentication fails closed with a stable reason code.

## Task 3: Implement a bounded Codex App Server model broker

Add `scripts/loop/runner/codex-app-server.mjs` exporting `createCodexAppServerBroker({ spawnImpl, auth, model, limits, now })`. It launches the configured Codex CLI App Server as a child process, passes only the App Server OAuth access token in the documented child-process environment, and speaks the documented JSON-RPC over stdio. Configure only the approved GPT-6-Luna model, disable App Server tools and workspace access, and expose the existing `invokeModelCall` shape used by `scripts/loop/runner/task-pipeline.mjs`.

Reject unknown methods, unexpected notifications, malformed/oversized frames, duplicate response IDs, wrong model identifiers, tool requests, and output beyond configured byte/token limits. Reserve model-call budget before dispatch. Propagate cancellation, enforce wall-clock deadlines, terminate the child on protocol failure, and fail closed when usage is missing while a token cap is active. Do not silently retry through another provider/model.

Add `scripts/loop/__tests__/runner-codex-app-server.test.mjs` with a fake child process and scripted JSON-RPC peer covering successful bounded completion, auth refresh, timeout/cancel, process exit, invalid framing, tool-call rejection, wrong model, output overflow, unknown usage under cap, and no fallback. Assert spawn args/environment contain no API key, GitHub credential, or task workspace mount. Wire this broker through `scripts/loop/runner/task-pipeline.mjs` while preserving the existing injected broker seam and Docker stdio bridge.

**Acceptance:** Protocol and budget tests pass with no actual child Codex process or network call. Existing Docker tests still prove the container has `--network none` and receives no host credential.

## Task 4: Add the authenticated Cloudflare runner-control API and D1 claim flow

Add `TASK_RUNNER_TOKEN` and a narrowly scoped runner-control API in `scripts/loop/hosted/cloudflare/src/handlers/runner-control.ts` and `scripts/loop/hosted/cloudflare/src/runner-auth.ts`. Authenticate an exact Bearer token using a constant-time comparison; reject absent/malformed credentials, unsupported methods, wrong repository IDs, oversized bodies, and unknown paths. Add no CORS access and no general D1 credential endpoint. The API token is separate from GitHub App and Codex credentials and is never returned by the API.

Use these exact endpoints and contracts:

- `POST /v1/runner/claim`, body `{ "repositoryId": number }`: select the oldest eligible TaskRecord from D1, revalidate the canonical policy and current GitHub Issue actor/action/label/body digest, check the original deadline and current lease, atomically claim one lease, and return `{ "status": "claimed", "packet": RunnerTaskPacket }`; return `{ "status": "idle" }` when no task is eligible. `RunnerTaskPacket` contains only `kind`, `repositoryId`, `issueNumber`, `generation`, `taskId`, `sourceRevision`, `policyRevision`, `expectedVersion`, `leaseOwner`, and `leaseUntil`; it has no queue delivery ID. Do not claim waiting-approval, terminal, stale-policy, or expired tasks. A live or unconfirmed prior lease is not stolen.
- `GET /v1/runner/tasks/:taskId`: return only the record and lease belonging to the configured repository and current authenticated runner.
- `POST /v1/runner/tasks/:taskId/record`: accept `{ "expectedVersion": number, "leaseOwner": string, "record": TaskRecord }`; validate exact identity and apply the existing compare-and-save-under-lease operation.
- `POST /v1/runner/tasks/:taskId/lease/renew` and `/release`: accept `{ "expectedVersion": number, "leaseOwner": string }`; enforce active owner, task version, repository, and deadline before mutating the lease.

Reuse/refactor `scripts/loop/hosted/cloudflare/src/storage/d1.ts` lease and TaskRecord operations, adding a D1 lease-renew operation if needed. Remove only the unprovisioned Issue-task queue producer/consumer route and binding from `webhook.ts`, `task-dispatch.ts`, `index.ts`, and `wrangler.jsonc`; retain or move any transport-neutral task envelope validation still needed by the runtime, and remove queue-only types only after all imports are migrated. Keep Stage 0 PR-event and dead-letter queues intact. Do not accept caller-supplied policy, approval, verified status, changed paths, or GitHub identity.

Add Worker tests in `scripts/loop/hosted/cloudflare/src/handlers/runner-control.test.ts` for auth, endpoint/method allowlist, body bounds, wrong repository, disabled policy, current Issue mismatch, deadline expiry, duplicate claims, active/unconfirmed lease, stale versions, and release/renew ownership. Update webhook and queue tests to prove Issue delivery creates D1 state without issuing a task queue message and Stage 0 PR queue behavior is unchanged.

**Acceptance:** D1 remains the only task state authority; API calls cannot bypass the existing policy, eligibility, lease, or version checks. No Task Queue dispatch remains for Issue tasks. Stage 0 queue tests pass.

## Task 5: Add the local polling service and remote TaskStore adapter

Add `scripts/loop/runner/cloudflare-control-client.mjs` implementing the exact API contracts above with strict response schemas, TLS-only base URL validation, timeouts, response-size limits, and redacted errors. Add `scripts/loop/runner/remote-task-store.mjs` implementing the runtime's `loadTaskRecord`, `loadTaskLease`, `assertTaskLease`, `compareAndSaveTaskRecordUnderLease`, `renewTaskLease`, and `releaseTaskLease` through those endpoints; do not add local state that can override D1.

Refactor `scripts/loop/tasks/runtime.mjs` to expose a direct in-process `dispatch(packet)` method that shares the same validation and task execution path as the existing authenticated gateway, so the local service does not open an inbound port. Implement `scripts/loop/runner/local-service.mjs` with `createLocalRunnerService({ controlClient, runtime, repositoryId, pollIntervalMs, now })` and `start()`, `stop()`, and redacted `status()`. Enforce one active task, claim only via Cloudflare, heartbeat/renew the existing lease, preserve the original deadline, and retain the lease/active slot when task termination is uncertain. On shutdown, request cancellation, wait only the bounded grace period, and let Cloudflare reconcile an uncertain lease rather than falsely releasing it.

Add tests in `scripts/loop/__tests__/runner-control-client.test.mjs`, `scripts/loop/__tests__/runner-remote-task-store.test.mjs`, and `scripts/loop/__tests__/runner-local-service.test.mjs` for idle polling, one-task concurrency, normal execution, offline/expired task, process shutdown, failed renewal, stale packet, uncertain termination, invalid server response, redaction, and no inbound listener. Update runtime tests for direct dispatch and verify it shares the existing lease/policy/Issue checks.

**Acceptance:** The process can poll and run a fake task using fake Cloudflare/runtime adapters, never listens on an inbound socket, and never extends deadlines or releases uncertain leases. All TaskRecord mutations go through D1-backed API calls.

## Task 6: Install and operate the runner on Windows

Add `scripts/loop/runner/service.mjs` as the process entry point and `scripts/loop/runner/install-windows-runner.ps1` / `uninstall-windows-runner.ps1` for a Windows Task Scheduler startup task running as the dedicated local runner identity. Configure the task to start at machine startup, run hidden, use the runner identity's protected profile, restart only the service process with bounded backoff, and wait for Docker engine readiness before claiming tasks. Do not place secrets in task arguments or scheduler metadata. The installer must validate Node 24, pnpm-independent runtime files, Docker isolation capabilities, repository path, canonical policy checkout, ACLs, and required environment configuration before registering the task. Status and uninstall commands must redact secrets.

If the readiness gate in Task 1 shows that Docker Desktop cannot be used safely by this startup task identity, do not install an interactive-user fallback; stop and report the platform blocker. Document machine-off behavior, the original deadline, startup prerequisites, health/status, log rotation/redaction, token rotation, and recovery after an interrupted task in `docs/loop-engineering/task-runner.md` and `docs/DEVELOPMENT.md`.

Add PowerShell validation tests where the repository supports them; otherwise add Node tests for the generated scheduler action/argument contract and a documented manual smoke procedure that uses a fake runtime and confirms no real model call. Keep installer tests from registering a real scheduled task by injecting the process runner.

**Acceptance:** Startup task uses the dedicated identity and no secret arguments, waits for Docker, polls only the configured Worker, and cannot auto-push, merge, or deploy. Install/uninstall/status paths are idempotent and redacted.

## Task 7: Complete implementation docs and verification, then stage the policy-only migration

For the implementation change, update `AGENTS.md`, `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, and append one entry to `Wiki/log.md` so the architecture records the local polling runner, ChatGPT-plan App Server boundary, disabled policy, isolated container, and human-controlled delivery. Update `docs/loop-engineering/task-runner.md`, `docs/DEVELOPMENT.md`, and the readiness report. Preserve the historical plan at `docs/superpowers/plans/2026-10-13-autonomous-issue-to-merge.md`; add only a dated note pointing to this approved migration spec/plan. Run and review the implementation checks, then stop at the policy boundary.

After the implementation change is reviewed and merged, start a fresh run dedicated to the policy migration. In that separate change, update the runner provider schema in `scripts/loop/policy.mjs`, `scripts/loop/tasks/issue-ingress.mjs`, and `scripts/loop/tasks/lifecycle.mjs` from `openai` to the single supported `codex-app-server` provider; update fixtures and exact-shape tests in `scripts/loop/__tests__/policy.test.mjs`, `scripts/loop/__tests__/github-issue-delivery.test.mjs`, and relevant lifecycle tests. Change `.agent/policy/autonomy.yml` to `provider: codex-app-server` and keep `enabled: false`, `autoMergeEnabled: false`, existing actor/path/risk/budget limits unchanged. No alternate provider is valid. Review and merge that policy revision separately, then start another fresh run before any autonomous task can be dispatched. The implementation run must not edit the canonical policy or execute a task under a modified policy.

Run focused tests first, then the full Loop and Worker checks:

```powershell
node --test scripts/loop/__tests__/*.test.mjs
pnpm --dir scripts/loop/hosted/cloudflare test
pnpm --dir scripts/loop/hosted/cloudflare typecheck
```

Also run `git diff --check`, inspect the complete diff for secrets, policy widening, changed protected paths, accidental queue removal, unexpected listeners, or task-container credentials/network access. Do not edit the canonical policy or dispatch a task in the implementation run. After the separate policy migration is reviewed and merged, start a fresh run; any pilot must use a fake Issue/task first and remain unable to write to GitHub.

**Acceptance:** All listed checks pass; policy remains disabled with auto-merge disabled; PR babysitter queues are unchanged; no external model call or GitHub write occurred; the fresh-run review boundary is explicit in the handoff.
