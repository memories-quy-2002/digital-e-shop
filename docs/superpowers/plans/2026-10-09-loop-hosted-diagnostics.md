# Loop Hosted Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Identify hosted probe and Worker consumer failures using bounded codes without changing verification decisions.

**Architecture:** Add refusal reasons to the existing Node probe and stage-aware diagnostics to the existing Cloudflare consumer. Reuse current error boundaries and D1 columns; preserve the Stage 0/Stage 1 separation.

**Tech Stack:** Node.js 24.20.0, pnpm 12.4.2, ESM JavaScript, TypeScript, Cloudflare Workers, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-09-loop-hosted-diagnostics-design.md`

**Status:** Approved on 2026-10-09; Tasks 1 and 2 implementation and Task 3 documentation are complete. Final cross-surface review and PR preparation remain pending.

## Global Constraints

- No dependencies, policy changes, App permission changes, workflow YAML changes, or D1 migrations.
- No raw exception text, stack/cause, request URLs, response bodies, credentials, or claims in diagnostics.
- Keep candidate-success shape unchanged; add `reasonCode` only to unavailable probe results.
- Worker remains Stage 0, publishes only neutral reports, and performs no reruns or repository writes.
- No remote deployment, mutation, Queue redelivery/purge, or direct push to main during implementation.
- Existing checkout and branch; preserve Luna-only subagent-driven execution preference.
- Exact high-risk scope is the seven paths enumerated in the spec; stop before expanding it.

## Review Focus

- A plausible-looking hostile `.code` must map to a fallback, not reach logs/storage.
- A second storage failure must not obscure the first failure stage.
- A stale PR or run must stay unavailable after diagnostic changes.
- A partial required-policy response must still wait and must not publish.
- A candidate-success result must preserve its existing exact key set.

## Task 1: Probe refusal and error-code contract

**Files:** `scripts/loop/stage1-source-sha-probe.mjs`, `scripts/loop/stage1-source-sha-probe-cli.mjs`, `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`.

**Interfaces:** Keep `inspectWorkflowSourceShaEvidence(input)` and `runSourceShaProbe(env, dependencies)` signatures. Export `normalizeSourceShaProbeErrorCode(error, fallback)` from the core; it returns only an existing allowlisted code or the caller's fixed fallback. The CLI imports it instead of maintaining a second provider-error list.

- [x] Add refusal-table tests covering each code from the spec, provider exceptions, null provider results, and claim mismatches. Assert unavailable status and null source candidate in every refused case.
- [x] Retain the success assertion with exactly the original seven keys. Add hostile `.code`, message, stack/cause, and payload sentinels; assert none appear in serialized results. Retain ignored-foreign-event no-output behavior.
- [x] Run `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs` and confirm new assertions fail for missing reasons.
- [x] Implement fixed reason assignment at existing refusal guards. Split combined guards only to label their existing failures; preserve their logical coverage and order. Use the normalizer in the provider catch and CLI catch.
- [x] Re-run the same command; all assertions must pass. Re-read each original guard against the patch.

## Task 2: Worker observer and consumer boundaries

**Files:** `scripts/loop/hosted/cloudflare/src/github/observer.ts`, `scripts/loop/hosted/cloudflare/src/handlers/queue.ts`, `scripts/loop/hosted/cloudflare/test/github-adapter.test.ts`, `scripts/loop/hosted/cloudflare/test/queue-consumer.test.ts`.

**Interfaces:** Keep observer/consumer public call signatures and successful results. Introduce a bounded observer error with fixed codes `pr_snapshot_invalid` and `check_observation_invalid`. Consumer diagnostic failures carry only fixed `code` and `stage`, using the stages and fallback mapping in the spec. Enumerate accepted existing provider/storage/Queue error codes from their definitions; do not accept arbitrary strings or error messages.

- [x] Add observer tests for malformed PR snapshot and malformed selected check evidence; assert fixed typed codes and no response content in diagnostic fields. Retain policy-incomplete wait fixtures.
- [x] Add consumer fault injection at every stage in the spec. Assert failed work does not acknowledge/publish subsequently, stored reason is bounded where delivery registration succeeded, and an acquired lease is released.
- [x] Add hostile valid-looking `.code` with message/stack/cause sentinels; assert fallback code and fixed stage. Add `setDeliveryStatus` failure after an observer failure; assert the original diagnostic survives.
- [x] Run `pnpm --dir scripts/loop/hosted/cloudflare test` and confirm the new diagnostic assertions fail.
- [x] Wrap only observer normalization boundaries; keep transport and incomplete-evidence handling. Track the consumer's current fixed stage before each operation, map known error codes, and emit bounded metadata in existing retry logs/storage. Preserve retries and successful return shape.
- [x] Run `pnpm --dir scripts/loop/hosted/cloudflare test` and `pnpm --dir scripts/loop/hosted/cloudflare typecheck`; both must pass. Verify existing corruption, stale policy, concurrency, and report tests remain unchanged or strengthened.

## Task 3: Documentation, verification, and one reviewable PR

**Files:** `docs/loop-engineering/hosted-stage0-runbook.md`, `docs/loop-engineering/stage1-readiness.md`, `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, `Wiki/log.md`, plus these spec/plan documents.

**Interfaces:** Document the diagnostics implemented by Tasks 1 and 2, with no new runtime capability. Wiki index date and append-only log entry follow repository rules.

- [x] Document how to interpret stage/reason codes and the default-branch rollout dependency. Record historical D1 evidence as a dated read-only sample; keep all Stage 1 promotion gates blocked pending fresh evidence.
- [x] Document deployment-version/source-SHA correlation and the separate maintainer-controlled deployment. Do not assume Queue retry records equal live backlog or that deploying current code resolves the unknown consumer failure.
- [x] Run `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs scripts/loop/__tests__/github-workflow-source-attestation.test.mjs scripts/loop/__tests__/workflow.test.mjs scripts/loop/__tests__/verify.test.mjs scripts/loop/__tests__/pr-runbook.test.mjs` (58/58 passed; documentation contract rerun passed 5/5 after the update).
- [x] Run the full Worker test command and typecheck once after final edits. Run `git diff --check` and inspect exact changed paths, diagnostic strings, decision guards, and token transport boundaries (2 portable + 87 Worker tests and typecheck passed).
- [ ] Perform Luna review using the preserved execution method; fix demonstrated findings within approved scope and repeat affected checks only.
- [ ] Commit exact paths with Conventional Commit messages on `bugfix/loop-hosted-diagnostics`, then prepare one PR into main under existing authorization. Include behavior changes, test evidence, limits, and the separate hosted rollout step. Do not merge or deploy as part of this plan.

## Completion boundary

Implementation completion means reviewed diagnostics and passing local/required
CI checks. Root-cause resolution and Stage 1 promotion require new hosted
evidence after review/merge and any separately approved Worker deployment.
