# Stage 1 CLI Approval and Flaky Rerun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Delegation is optional only after explicit authorization and applicable repository orchestration rules; this plan does not dispatch subagents.

**Goal:** Maintainer xem bằng chứng CI flaky, duyệt đúng target trong CLI và gửi một rerun có giới hạn, sau đó theo dõi kết quả GitHub mới.

**Architecture:** Hosted Stage 0 giữ nhiệm vụ quan sát/report. Một trusted Node.js host riêng nối CLI hiện có với GitHub App device-flow approval, policy canonical và Actions write adapter. Nguồn workflow attestation và finite CI budget là gate độc lập; chưa review thì host chỉ inspect hoặc refuse, không POST.

**Tech Stack:** Node.js `24.20.0`, pnpm `12.4.2`, ESM `.mjs`, `node:test`, Node readline, GitHub App và REST API; Cloudflare Worker/D1/Queue Stage 0 hiện có.

**Approved design:** [2026-10-05-stage1-cli-flaky-rerun-design.md](../specs/2026-10-05-stage1-cli-flaky-rerun-design.md), được người dùng duyệt ngày 2026-10-05.

## Global Constraints

- Stage 1 chỉ rerun lỗi được xác nhận flaky; sửa code thuộc Stage 2.
- Host chỉ cho phép `inspect` và `rerun-flaky`; không repair, push, merge hoặc deploy authority.
- Không đưa `actions:write` vào Worker hoặc token publisher.
- Approval cần fresh TTY, trusted numeric user ID, expiry và single-use; không thêm `--yes` hoặc chat/JSON approval.
- Approval bind repository/PR, base/head/merge SHA, tested SHA, capability, workflow path/ID, run/attempt và toàn bộ failed job IDs.
- API write duy nhất: `POST /repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs`. Endpoint còn rerun dependent jobs, nên toàn bộ job graph phải được review.
- Canonical policy và allowlist không lấy từ PR-controlled inputs. Workflow/reusable workflow/local action thay đổi trong PR làm rerun refuse.
- `maxFlakyRetries=3`, `maxWallClockSeconds=1800`; `ciRunLimit=2` là đề xuất pilot cần review policy riêng. Hiện canonical `ciRunLimit=null` phải refuse live write.
- Reserve CI budget/idempotency trước POST. Timeout sau POST không được auto-submit lại.
- Không persist credentials, PEM, device token, approval handle, raw CI logs hoặc review bodies.
- Không thêm dependency nếu Node.js và các adapter hiện có đáp ứng được.
- Không tạo worktree. Implementation cần nhánh feature mới từ reviewed main khi đến thời điểm thực hiện; nhánh hiện tại chỉ chứa kế hoạch.
- `scripts/loop/**`, `.agent/policy/**`, `.github/workflows/**` là high-risk. Trước implementation cần authorization đúng path scope; approval plan không thay thế authorization đó.
- Policy changes review/merge trong run riêng; chỉ sau đó mới bắt đầu run mới dùng policy đã review.

## Execution order and stop gates

| Order | Deliverable | Điều kiện chuyển bước |
| --- | --- | --- |
| 1 | Stage 0 readiness evidence | 10 representative failed/pending observations, 0 stale actionable decisions, 0 protected/infrastructure misclassifications |
| 2 | Reviewed attestation-source design và job allowlist | Có nguồn trust xác minh independently; không suy luận source SHA từ display name/path/head SHA |
| 3 | Reviewed finite-budget policy | Policy đã merge trong run riêng; implementation checkout bắt đầu từ reviewed revision |
| 4–8 | Tested trusted Stage 1 host/CLI | Mocked negative/positive suites và required CI pass |
| 9 | Live pilot có approval riêng | App permissions, trust source, allowlist và promotion evidence đều được review |

Tasks 4–8 có thể phát triển bằng fixture để chứng minh fail-closed khi Task 2 chưa có live attestation. Điều đó không cho phép bypass gate ở Task 9. Không coi source provider chưa chọn là một hàm `return true` cần điền sau: Task 2 là deliverable thiết kế bắt buộc phải review trước live wiring.

## File map

| Path | Vai trò dự kiến |
| --- | --- |
| `docs/loop-engineering/stage1-readiness.md` | Bounded promotion evidence, phân biệt live observation/fixture |
| `docs/superpowers/specs/2026-10-05-stage1-workflow-attestation-design.md` | Thiết kế nguồn attestation và verification trust boundary |
| `docs/loop-engineering/stage1-cli-runbook.md` | Setup, inspect/approve/rerun, reason codes, disable |
| `scripts/loop/workflow-source-attestation.mjs` | Boundary callback kiểm chứng source; fail closed nếu live provider chưa được review |
| `scripts/loop/stage1-target.mjs` | Chọn đúng một target từ fresh, validated workflow observations |
| `scripts/loop/stage1-prompt.mjs` | TTY device/approval UI, hủy mặc định |
| `scripts/loop/pr-babysitter-stage1-host.mjs` | Trusted composition root, entrypoint chỉ inspect/rerun-flaky |
| `scripts/loop/pr-babysitter-host.mjs` | Chia sẻ tối thiểu bootstrap/observation helpers nếu cần; giữ Stage 0 read-only |
| `scripts/loop/pr-babysitter-cli.mjs` | Nối review context và outcome, giữ existing gates |
| `scripts/loop/github-actions-write.mjs` | Tái sử dụng guarded writer; harden chỉ khi regression chứng minh gap |
| `scripts/loop/__tests__/workflow-source-attestation.test.mjs` | Attestation refusal matrix |
| `scripts/loop/__tests__/stage1-target.test.mjs` | Target cardinality, identity và attempt |
| `scripts/loop/__tests__/stage1-prompt.test.mjs` | TTY, default cancel và prompt scope |
| `scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs` | Host routing, trusted inputs, state, capability separation |
| Existing auth/actions/CLI tests | Regression approval, budgets, races, retries |
| `.agent/policy/stop-conditions.yml` | Finite CI budget trong PR policy riêng |
| `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, `Wiki/log.md` | Cập nhật hiểu biết khi implementation thật thay đổi runtime |

Paths là scope đề xuất để review implementation, không phải các file đã được sửa trong lượt lập kế hoạch.

### Task 1: Record Stage 0 readiness

**Files:** Create `docs/loop-engineering/stage1-readiness.md`; read both Loop runbooks, Worker scheduler/queue/report code.
**Consumes:** GitHub PR/check/run metadata, Cloudflare queue evidence đã redacted.
**Produces:** Promotion report ghi rõ passed/blocked cho từng gate; không chứa live credentials.

- [ ] Ghi bảng ít nhất 10 observations với các cột: observedAt, repositoryId, prNumber, baseSha, headSha, mergeSha, testedSha, requiredIdentity, outcome, classification, reasonCode, evidenceKind.
- [ ] Dùng existing read-only command để quan sát; exit code wait/escalated không bị báo thành infrastructure failure:

```powershell
node scripts/loop/pr-babysitter-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr 123
```

`123` là ví dụ cú pháp; khi thực hiện dùng PR được maintainer chọn trong pilot. Không bịa ID/evidence để đạt count.
- [ ] Xác nhận cron sweep, downstream queue processing và publication là ba evidence riêng. `last_completed_at` không chứng minh cả ba.
- [ ] Kiểm tra 0 stale actionable decisions, 0 protected/infrastructure misclassifications và bounded metadata không có secrets.
- [ ] Commit chỉ report sau review: `docs(loop): record stage1 readiness evidence`.

### Task 2: Review workflow trust source and complete job allowlist

**Files:** Create attestation design spec; read `github-actions-write.mjs`, `github-pr-client.mjs`, reviewed CI definitions và dependencies.
**Consumes:** Existing `verifyWorkflowSourceAttestation({ identity, run, snapshot })` contract; host-owned workflow allowlist.
**Produces:** Reviewed live provider contract và cấu hình allowlist chính xác. Chưa có provider thì gate remains blocked.

- [ ] Audit workflow ID/path/ref/source SHA, reusable workflows, local actions, dynamic matrix/job names, all jobs, secrets, protected environments và token permissions.
- [ ] Ghi issuer/verifier, trust-anchor ownership, authenticated record retrieval, anti-replay binding và verification algorithm cho nguồn được chọn. Không đưa key/trust anchors từ PR vào verifier.
- [ ] Record phải bind repository ID, workflow path/ref/source SHA, run ID/attempt và tested SHA. Nếu cần CI producer, thiết kế producer trong PR CI riêng; giữ eligible rerun jobs không có secrets/protected environment/write token.
- [ ] Review nguồn đó theo policy; nếu chưa xác minh được source của run thì output `workflow_source_sha_unattested`, không fallback.
- [ ] Chỉ allowlist workflow identity có path/source SHA đã verified trong pilot đầu. Check-only identity không map chắc chắn vào workflow trả `unsupported_required_identity`, không chuyển thành workflow bằng tên.
- [ ] Review cả dependent jobs: adapter hiện kiểm tra mọi job name trong observed run; không nới gate thành chỉ kiểm tra failed jobs. Dynamic graph không đủ evidence phải refuse.
- [ ] Commit thiết kế nguồn và allowlist audit trước khi triển khai provider: `docs(loop): specify stage1 workflow source trust`.

Reference: [GitHub rerun-failed-jobs semantics](https://docs.github.com/en/rest/actions/workflow-runs#re-run-failed-jobs-from-a-workflow-run). GitHub chạy lại failed jobs và dependent jobs; quyền API cần Actions write. Không thêm rerun-workflow hoặc single-job endpoint vào transport allowlist.

### Task 3: Review canonical finite CI budget separately

**Files:** Modify `.agent/policy/stop-conditions.yml` trong PR được scope-approved riêng; targeted tests `scripts/loop/__tests__/state.test.mjs` và `github-actions-write.test.mjs`.
**Consumes:** Current policy/state schema v2, per-PR flaky counters.
**Produces:** Canonical policy revision có hữu hạn budget; live host vẫn refuse nếu persisted state không khớp.

- [ ] Review JSON policy đề xuất; chỉ thay `ciRunLimit` từ null thành 2:

```json
{
  "schemaVersion": 1,
  "maxIterations": 5,
  "maxSameFailure": 2,
  "maxFlakyRetries": 3,
  "maxChangedFiles": 25,
  "maxChangedLines": 1000,
  "maxWallClockSeconds": 1800,
  "tokenLimit": null,
  "ciRunLimit": 2
}
```

- [ ] Test refusal khi policy hoặc state CI limit null; test exhaustion, missing/corrupt/stale state và wall-clock limit. Không auto-reset persisted session để có lượt mới.
- [ ] Run `node --test scripts/loop/__tests__/state.test.mjs scripts/loop/__tests__/github-actions-write.test.mjs`; expected: all pass, không live network.
- [ ] Commit qua policy PR: `fix(loop): require a finite CI rerun budget`.
- [ ] Review/merge policy, kết thúc run policy; bắt đầu implementation run mới từ revision đã review. Không execute dưới policy vừa sửa trong cùng run.

### Task 4: Implement attestation verification boundary

**Files:** Create `scripts/loop/workflow-source-attestation.mjs` và test tương ứng. Live provider implementation phải theo đúng Task 2 được review; boundary không tự phát hành attestation.
**Consumes:** `verifyTrustedRecord({ identity, run, snapshot }) -> Promise<boolean>` từ trusted host, không từ argv/env/PR.
**Produces:** Callback dùng trực tiếp cho existing Actions write host.

- [ ] Write failing negative tests: absent verifier; forged PR metadata; wrong repository/source/run/attempt/tested SHA; missing record; provider rejection/throw.
- [ ] Run `node --test scripts/loop/__tests__/workflow-source-attestation.test.mjs`; expected: module/function absent trước implementation, rồi assertions pass.
- [ ] Implement fail-closed callback boundary:

```javascript
export function createWorkflowSourceVerifier({ verifyTrustedRecord } = {}) {
  return async function verifyWorkflowSourceAttestation({ identity, run, snapshot } = {}) {
    if (typeof verifyTrustedRecord !== 'function' || !identity || !run || !snapshot) return false;
    if (identity.type !== 'workflow' || run.sourceShaAttested !== true) return false;
    if (identity.repositoryId !== snapshot.repositoryId || run.repositoryId !== snapshot.repositoryId) return false;
    if (identity.path !== run.path || identity.ref !== run.ref || identity.sha !== run.sourceSha) return false;
    if (!Number.isSafeInteger(run.id) || run.id < 1 || !Number.isSafeInteger(run.runAttempt) || run.runAttempt < 1) return false;
    if (run.testedSha !== snapshot.headSha && run.testedSha !== snapshot.mergeSha) return false;
    try { return await verifyTrustedRecord({ identity, run, snapshot }) === true; }
    catch { return false; }
  };
}
```

Boundary shape checks bổ sung adapter checks, không thay signature/issuer/replay verification của provider Task 2. Không bật `sourceShaAttested` chỉ vì callback fixture trả true.
- [ ] Add meaningful no-provider test:

```javascript
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createWorkflowSourceVerifier } from '../workflow-source-attestation.mjs';

it('refuses caller-asserted source metadata without a trusted verifier', async () => {
  const sha = 'a'.repeat(40);
  const snapshot = { repositoryId: 9, headSha: sha, mergeSha: null };
  const identity = { type: 'workflow', repositoryId: 9, path: '.github/workflows/ci.yml', ref: 'refs/heads/main', sha };
  const run = { id: 17, runAttempt: 1, repositoryId: 9, path: identity.path, ref: identity.ref, sourceSha: sha, sourceShaAttested: true, testedSha: sha };
  assert.equal(await createWorkflowSourceVerifier()({ identity, run, snapshot }), false);
});
```

- [ ] Run boundary and existing Actions tests; commit `feat(loop): verify stage1 workflow source evidence` after reviewed provider tests also pass, or explicitly label the boundary-only commit without claiming live trust support.

### Task 5: Build fresh unique rerun target selection

**Files:** Create `scripts/loop/stage1-target.mjs`, `scripts/loop/__tests__/stage1-target.test.mjs`; use fresh PR client jobs/run reads and current normalized observations.
**Consumes:** Decision `retry-check`, current observation identity, fully validated candidate targets matching adapter schema.
**Produces:** `selectUniqueRerunTarget({ decision, candidates }) -> target`; `getTarget` host adapter collects and validates candidates before calling it.

- [ ] Write failure cases: 0 candidates, 2 matching runs, stale attempt, wrong tested SHA, failed job set mismatch, nonallowlisted job, cancelled/action_required/dependent job uncertainty.
- [ ] Run target tests; implement cardinality selection without granting write authority:

```javascript
export function selectUniqueRerunTarget({ decision, candidates }) {
  if (decision?.action !== 'retry-check') throw Object.assign(new Error('retry_decision_required'), { code: 'retry_decision_required' });
  if (!Array.isArray(candidates) || candidates.length !== 1) {
    throw Object.assign(new Error('rerun_target_ambiguous'), { code: 'rerun_target_ambiguous' });
  }
  return candidates[0];
}
```

- [ ] Implement `actions.getTarget({ decision, observations, prSnapshot })` using freshly read run/jobs, exact required workflow identity and complete collections. Return fields: repositoryId, prNumber, baseSha, headSha, mergeSha, testedSha, requiredIdentity, workflowId, runId, runAttempt, failedJobIds, failureAttemptKey.
- [ ] Test uniqueness explicitly:

```javascript
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { selectUniqueRerunTarget } from '../stage1-target.mjs';
it('does not choose between two rerun candidates', () => {
  assert.throws(() => selectUniqueRerunTarget({ decision: { action: 'retry-check' }, candidates: [{ runId: 17 }, { runId: 18 }] }), { code: 'rerun_target_ambiguous' });
});
```

- [ ] `selectUniqueRerunTarget` chỉ chọn cardinality. Target vẫn phải qua CLI `validateActionTarget` và Actions writer fresh checks trước approval/write; không bỏ gates vì target selector đã trả object.
- [ ] Run target + Actions + CLI suites; commit `feat(loop): select an exact stage1 rerun target`.

### Task 6: Implement cancel-by-default TTY review

**Files:** Create `scripts/loop/stage1-prompt.mjs`, `scripts/loop/__tests__/stage1-prompt.test.mjs`; modify CLI review-context wiring nếu cần.
**Consumes:** Existing auth payload types `device-code`, `approval`; trusted context `getReviewContext()` trả branch, classification, remainingCIRuns, remainingFlakyRetries và workflow job-graph summary.
**Produces:** Prompt function có `prompt.isTTY` đúng terminal thật, `Promise<boolean>`; approval opaque vẫn do auth provider tạo.

- [ ] Test non-TTY cả input/output, unknown payload, enter mặc định cancel, explicit cancel, exact confirm, expiry và context mismatch.
- [ ] Implement using Node readline; reviewed context không được lấy từ raw CI log:

```javascript
import { createInterface } from 'node:readline/promises';
export function createStage1Prompt({ input, output, getReviewContext }) {
  const prompt = async (payload) => {
    if (prompt.isTTY !== true) return false;
    if (payload.type !== 'device-code' && payload.type !== 'approval') return false;
    const terminal = createInterface({ input, output });
    try {
      if (payload.type === 'device-code') {
        output.write(`Open ${payload.verificationUri}; enter code ${payload.userCode}\n`);
        return await terminal.question('Continue GitHub authentication? Type CONTINUE: ') === 'CONTINUE';
      }
      const review = await getReviewContext();
      if (!review || review.classification !== 'flaky') return false;
      if (!Number.isSafeInteger(review.remainingCIRuns) || review.remainingCIRuns < 1) return false;
      if (!Number.isSafeInteger(review.remainingFlakyRetries) || review.remainingFlakyRetries < 1) return false;
      output.write(JSON.stringify({ repository: payload.repository, repositoryId: payload.repositoryId,
        prNumber: payload.prNumber, revision: payload.revision, capability: payload.capability,
        paths: payload.paths, testedSha: payload.testedSha, actionTarget: payload.actionTarget,
        approverId: payload.approverId, expiresAt: payload.expiresAt,
        branch: review.branch, classification: review.classification,
        remainingCIRuns: review.remainingCIRuns, remainingFlakyRetries: review.remainingFlakyRetries,
        jobGraph: review.jobGraph }) + '\n');
      return await terminal.question('Rerun failed jobs and their dependent jobs? Type RERUN: ') === 'RERUN';
    } finally { terminal.close(); }
  };
  prompt.isTTY = input.isTTY === true && output.isTTY === true;
  return prompt;
}
```

All `getReviewContext()` values phải là bounded, validated metadata matched to target; budget checks trong CLI/writer vẫn authoritative. Không log/persist device user code hoặc prompt output vào loop telemetry. Prompt không serialize opaque approval.
- [ ] Test no-read/no-write on non-TTY:

```javascript
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { createStage1Prompt } from '../stage1-prompt.mjs';
it('never asks for approval through a pipe', async () => {
  let touched = false;
  const prompt = createStage1Prompt({ input: { isTTY: false }, output: { isTTY: true, write() { touched = true; } }, getReviewContext: async () => { touched = true; } });
  assert.equal(prompt.isTTY, false);
  assert.equal(await prompt({ type: 'approval' }), false);
  assert.equal(touched, false);
});
```

- [ ] Add actual TTY-stream fixture tests for confirm/cancel and payload scope; run prompt/auth/CLI suites; commit `feat(loop): review stage1 reruns through a TTY`.

### Task 7: Wire a trusted host and narrow entrypoint

**Files:** Create `scripts/loop/pr-babysitter-stage1-host.mjs`, `scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs`; minimally share existing helpers from `pr-babysitter-host.mjs` only if avoiding divergent security checks requires it.
**Consumes:** Trusted config, verified attestation provider, Tasks 5–6, current PR/state/policy, auth/write adapters.
**Produces:** `createPrBabysitterStage1Host({ prNumber, repoRoot, env }) -> Promise<trustedHost>`; `runPrBabysitterStage1({ argv, repoRoot, env, io }) -> Promise<{exitCode,...}>`.

- [ ] Add tests before implementation: reject repair/push/unknown command before credentials/network; wrong repository; closed/fork/main-head PR; checkout mismatch; modified trusted config; source unverified; state corrupt; non-TTY rerun.
- [ ] Bootstrap with same repository/check-out/App-file validation and canonical base policy reads as Stage 0. Load reviewed allowlist/approver IDs from trusted host configuration bound to reviewed revision, not new CLI flags or PR files. Existing private key stays outside checkout and never enters output.
- [ ] Host config stays compatible with `runPrBabysitterCli`: repository, repositoryId, repoRoot, taskId, policy. Adapters: `pr.collect/refresh`, `state.load/save`, auth provider, `actions.host/getTarget/rerunFailedJobs`, `budget`, `telemetry`; frozen empty repair/writer adapters satisfy current CLI contract without granting them capabilities.
- [ ] Construct Actions context through existing API, not a caller-supplied serialized context:

```javascript
const actionsContext = createGitHubActionsWriteHost({
  repository: hostConfig.repository,
  repositoryId: hostConfig.repositoryId,
  repoRoot: hostConfig.repoRoot,
  taskId: hostConfig.taskId,
  policy: hostConfig.policy,
  prClient,
  approvalProvider: authProvider,
  workflowAllowlist: trustedConfig.workflowAllowlist,
  verifyWorkflowSourceAttestation,
});
const actions = Object.freeze({ host: actionsContext, getTarget,
  rerunFailedJobs: (input) => rerunFailedJobs(input) });
```

`hostConfig`, `prClient`, `authProvider`, `trustedConfig`, `verifyWorkflowSourceAttestation` và `getTarget` là local values do bootstrap nêu trên và Tasks 2/4/5/6 tạo; không nhận chúng qua user argv.
- [ ] Reuse Stage 0 observation/check SHA selection and bounded metadata. Populate workflow evidence only through reviewed attestation provider; unavailable evidence remains unavailable.
- [ ] State session: begin session explicitly only for a newly trusted task identity, persist once, then reload by task identity. Repeated invocation resumes same task/attempt history; missing/corrupt persisted session refuses. Do not generate a fresh task ID per command to regain budget.
- [ ] Gate commands before host construction with this complete routing helper in entrypoint module:

```javascript
export function assertStage1Command(args, isTTY) {
  if (!['inspect', 'rerun-flaky'].includes(args.command)) {
    throw Object.assign(new Error('stage1_command_refused'), { code: 'stage1_command_refused' });
  }
  if (args.repository !== 'memories-quy-2002/digital-e-shop') {
    throw Object.assign(new Error('repository_not_allowlisted'), { code: 'repository_not_allowlisted' });
  }
  if (args.command === 'rerun-flaky' && isTTY !== true && args.dryRun !== true) {
    throw Object.assign(new Error('interactive_tty_required'), { code: 'interactive_tty_required' });
  }
}
```

- [ ] Parse using existing `parsePrBabysitterArguments`; derive TTY from actual process streams. `--dry-run` follows existing syntax-only behavior and prints no eligibility claim, token or approval. After gate, call constructor and existing `runPrBabysitterCli`.
- [ ] Verify observe reads use observe-scoped installation tokens even when App has Actions write globally. Only guarded writer requests capability `actions:rerun` after authenticated approval. Stage 0 entrypoint still denies all write commands.
- [ ] Run new host tests, existing host CLI/actions/auth suites and Stage 0 tests; commit `feat(loop): add a trusted stage1 CLI host`.

### Task 8: Race, budget and outcome regression matrix

**Files:** Extend `github-actions-write.test.mjs`, `github-auth-provider.test.mjs`, `pr-babysitter-cli.test.mjs`, new Stage 1 suites; modify corresponding source only for demonstrated gaps.
**Consumes:** Existing fixtures using fake credentials, persisted temporary state and mocked API.
**Produces:** Evidence that no negative case reaches GitHub POST and no successful request is mislabeled as CI pass.

| Test trigger | Expected |
| --- | --- |
| SHA tuple changes before approval / after approval / after token mint | Refuse; 0 POST |
| Source issuer/SHA/run/attempt/tested SHA wrong | Refuse; 0 POST |
| Approval forged, expired, replayed, untrusted approver, lacks repo write | Refuse; 0 POST |
| Policy or state CI budget null; limit exhausted; wall-clock exceeded | Refuse; 0 POST |
| Workflow/reusable workflow/local action changed; jobs outside allowlist | Refuse; 0 POST |
| Failed jobs incomplete/extra, dependent graph unknown, cancelled jobs | Refuse; 0 POST |
| Two invocations same action attempt | One persisted reservation/submission |
| HTTP timeout after write | Uncertain recorded attempt; no auto-resubmit |
| GitHub accepts valid POST | submitted/wait; CI not labeled pass |
| Fresh inspect of new attempt pending/fail/pass | Report actual new observation; no old green reuse |
| Nonflaky code failure | Explain Stage 2 handoff; 0 rerun POST |
| Invalid/missing state after reservation | Refuse; no silent reset |

- [ ] Add meaningful assertions to current `createRerunHarness` inside `pr-babysitter-cli.test.mjs`, including existing decision action `retry-check`, exact target scope, order of refresh/token/reservation/POST and `exitCode=wait` after accepted request.
- [ ] Run bounded targeted tests:

```powershell
node --test scripts/loop/__tests__/workflow-source-attestation.test.mjs scripts/loop/__tests__/stage1-target.test.mjs scripts/loop/__tests__/stage1-prompt.test.mjs scripts/loop/__tests__/pr-babysitter-stage1-host.test.mjs scripts/loop/__tests__/github-actions-write.test.mjs scripts/loop/__tests__/github-auth-provider.test.mjs scripts/loop/__tests__/pr-babysitter-cli.test.mjs
```

Expected: all pass with fake keys/tokens, no live GitHub mutation.
- [ ] Run full loop unit suite with explicit test-file discovery, plus Stage 0 Worker regression:

```powershell
$loopTestFiles = @(rg --files scripts/loop/__tests__ -g '*.test.mjs')
if ($loopTestFiles.Count -eq 0) { throw 'No Loop test files found' }
node --test @loopTestFiles
pnpm --dir scripts/loop/hosted/cloudflare test
pnpm --dir scripts/loop/hosted/cloudflare typecheck
```

Expected: all pass. For required fixed full verification, use existing verifier API/CLI contract at execution revision; include its external CI requirements and SHA/fingerprint match. Do not invent an unsupported verifier flag or report local green as hosted CI completion.
- [ ] Run required external checks from clean checkout at current revision; mismatched SHA or missing check stays blocked. Review no security/test gate disabled.
- [ ] Commit demonstrated hardening/regressions: `test(loop): cover stage1 approval and rerun races`.

### Task 9: Runbook, reviewed live pilot and disable path

**Files:** Create `docs/loop-engineering/stage1-cli-runbook.md`; update Stage 1 section of Phase 2 runbook, readiness evidence and Wiki concept/index/log when runtime ships.
**Consumes:** AC evidence from Tasks 1–8, reviewed App permission change and live attestation source.
**Produces:** Operating instructions and bounded pilot evidence; no automatic Stage 2 promotion.

- [ ] Document proposed entrypoint commands only after host exists:

```powershell
node scripts/loop/pr-babysitter-stage1-host.mjs inspect --repo memories-quy-2002/digital-e-shop --pr 123
node scripts/loop/pr-babysitter-stage1-host.mjs rerun-flaky --repo memories-quy-2002/digital-e-shop --pr 123
```

- [ ] Explain when to open CLI: failed GitHub PR Checks trigger inspection; initial release has no terminal popup, Slack/email notification or worker auto-rerun. Verify absence of Stage 0 report is not interpreted as CI pass.
- [ ] Show approval example containing full target and bounded job graph; cancel default. Explain code-caused/infrastructure/protected/ambiguous failures and operational reason codes.
- [ ] Review GitHub App Actions-write installation permission separately, keeping Worker/publisher token scopes unchanged. No key values in docs or recorded evidence.
- [ ] Gate live pilot on all prerequisites, same-repository non-main PR, exact allowlisted workflow and fresh TTY approval. Use a legitimate flaky observation with same-revision pass/fail evidence, not an intentionally weakened security/test job.
- [ ] Inspect before approval, submit once, then verify new attempt on GitHub and actual pass/fail. Record timestamp, tuple, run/attempt, actionAttemptKey, budget consumed, status and reasonCode.
- [ ] Disable procedure: stop using rerun command, remove/revoke trusted Stage 1 Actions-write capability/config; retain observe/report and bounded state for diagnosis. Do not alter production application data.
- [ ] Collect at least 10 bounded rerun decisions, or sufficient representative fixtures when real flaky failures are rare, as current Stage 2 gate permits. Neither count nor this plan enables repair/push/merge.
- [ ] Commit docs: `docs(loop): document stage1 CLI operations`.

## Acceptance coverage and review checklist

| Design AC | Plan coverage |
| --- | --- |
| AC-01 fresh classification, no failed=flaky shortcut | Tasks 1, 5, 7, 8 |
| AC-02 trusted approver, TTY, single-use/expiry | Tasks 6–8 |
| AC-03 exact target and failed job set | Tasks 2, 5–8 |
| AC-04 attestation and reviewed allowlist | Tasks 2, 4, 7–9 |
| AC-05 fresh tuple/workflow/job checks after approval/token | Tasks 7–8, existing writer retained |
| AC-06 reserve/idempotency/no timeout resubmit | Tasks 3, 7–8 |
| AC-07 proposed/submitted/pending/pass/fail distinguished | Tasks 6, 8–9 |
| AC-08 no repair/push/merge/deploy or Worker write capability | Tasks 2, 7–9 |
| AC-09 bounded metadata/no credentials | Tasks 1, 6–9 |
| AC-10 reviewed promotion/CI gates | Tasks 1–3, 8–9 |

Implementation self-review: verify exact names/interfaces match; review each negative test before live activation; no placeholder provider; unavailable trust/budget is explicit refusal. Changes to scope or trust mechanism require design review, not an implementation-time safety bypass.

## Handoff for this planning change

This change only updates the approved design metadata and adds this plan. Do not run Stage 1, change policy/App permissions or alter Worker behavior while committing the plan. Docs-only verification: UTF-8/link/path checks, placeholder/consistency review, staged whitespace check and commit-lint.

Commit message: `docs(loop): plan stage1 CLI approval and flaky rerun`.

```powershell
git add -- docs/superpowers/specs/2026-10-05-stage1-cli-flaky-rerun-design.md docs/superpowers/plans/2026-10-05-stage1-cli-flaky-rerun.md
git diff --cached --check
git commit -m "docs(loop): plan stage1 CLI approval and flaky rerun"
pnpm --dir server exec commitlint --from origin/main --to HEAD --verbose
git push --set-upstream origin feature/stage1-cli-approval-plan
```

Current task authorization covers commit/push of planning changes on the current feature branch. Implementation begins only on a later instruction with exact protected-path scope and prerequisite reviews satisfied.
