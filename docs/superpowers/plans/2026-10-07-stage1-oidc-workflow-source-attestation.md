# Stage 1 OIDC Workflow-Source Attestation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the exact GitHub Actions workflow-source commit and run attempt for selected workflow runs, while keeping Stage 1 disabled until its other trust and budget gates are separately completed.

**Architecture:** A maintainer-selected, same-repository PR run creates a deterministic run descriptor and attests it with GitHub's OIDC-backed artifact-attestation service. A host computes the expected descriptor from fresh GitHub observations, verifies it with GitHub CLI, and creates an immutable verifier-owned source record from signed certificate fields; no caller flag or statement predicate can establish trust. Missing, stale, ambiguous, malformed, or mismatched evidence remains unavailable.

**Tech Stack:** Node.js 24 built-ins and `node:test`; GitHub Actions; `actions/attest` v4.2.2 pinned to `1e69f48acb82d1966a394da916b4c1698aa569d6`; GitHub CLI 2.92.0 or newer for `gh attestation verify`.

**Spec:** `docs/superpowers/specs/2026-10-07-stage1-oidc-workflow-source-attestation-design.md`

## Global Constraints

- Keep the exact workflow-source commit requirement; never substitute tested SHA, workflow path/ref, check name, display name, producer input, or predicate claims.
- The descriptor has no source-SHA field. Read the trusted source SHA only from certificate `githubWorkflowSHA` and require it to equal certificate `buildSignerDigest`.
- Treat the verified statement predicate as user-controlled; compare the local subject digest and certificate claims against fresh host observations.
- Only a verifier-created immutable record may carry trusted workflow-source identity into an adapter. Raw API fields and caller-settable `sourceShaAttested` flags are never trusted.
- The attestation job runs only for the `loop-stage1-attestation-pilot` label on a same-repository PR. It does not check out or execute PR code.
- Use the fixed subject name `digital-e-loop-workflow-source.json` and a SHA-256 digest encoded as `sha256:` followed by 64 lowercase hexadecimal characters, computed from canonical descriptor bytes.
- Grant only `actions: read`, `contents: read`, `id-token: write`, and `attestations: write` to the attestation job. Do not grant `actions: write`, `contents: write`, `artifact-metadata: write`, deployment access, or production secrets.
- Do not change `.agent/policy/**`, GitHub App installation permissions, Stage 1 activation status, CI rerun behavior, or the run-attempt write contract in this plan.
- Do not create the pilot label through the GitHub API as part of this plan; a maintainer applies `loop-stage1-attestation-pilot` to the selected PR when the hosted proof is ready.
- Existing runs without a matching attestation keep the `workflow_source_sha_unattested` refusal.
- Attestation use stays opt-in and bounded because GitHub advises against attesting frequent automated test builds.
- High-risk implementation paths below require human approval for this exact file scope before code or workflow edits. This plan and the approved design spec do not grant that path approval.
- Do not push, merge, use the Actions rerun API, manually rerun an existing run, or perform production operations as part of this plan. A maintainer-applied pilot label creates a new, bounded workflow run.

---

## Files and Responsibilities

- Create `scripts/loop/workflow-source-descriptor.mjs`: validate and serialize the fixed descriptor contract with deterministic field order.
- Create `scripts/loop/github-workflow-source-attestation.mjs`: validate the installed `gh` CLI version, call it without a shell, verify the descriptor against GitHub/Sigstore trust, and return certificate evidence for the common verifier.
- Modify `scripts/loop/workflow-source-attestation.mjs`: validate raw run and snapshot data, validate provider evidence, and issue an immutable verifier-owned record.
- Modify `scripts/loop/github-pr-client.mjs`: accept an optional trusted source verifier and use it only for exact required-workflow matches; retain unavailable evidence when no verifier is configured.
- Modify `scripts/loop/github-actions-write.mjs`: consume only verifier-owned source records before job evidence or a rerun request; remove trust in raw `sourceSha` and `sourceShaAttested` values.
- Modify `.github/workflows/loop-foundation.yml`: add a label-gated, no-checkout attestation job and include its static security tests in the fixed test list.
- Modify `scripts/loop/__tests__/workflow.test.mjs`: assert the added event type, pinned action, scoped permissions, and no-checkout condition.
- Modify `scripts/loop/stage1-source-sha-probe.mjs` and `scripts/loop/stage1-source-sha-probe-cli.mjs`: replace raw API-field probing with a read-only, certificate-backed feasibility report.
- Modify `.github/workflows/loop-source-sha-probe.yml`: keep the downstream probe read-only while granting only the specific read permissions needed to inspect attestations and the associated PR tuple.
- Modify `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`: prove that only certificate claims can produce a source-SHA candidate and that the probe never creates a trusted write record.
- Add focused descriptor and provider tests under `scripts/loop/__tests__/`; update the existing workflow, source-probe, verifier, PR-client, and Actions-writer tests.
- Update `docs/loop-engineering/stage1-cli-runbook.md`, `docs/loop-engineering/stage1-readiness.md`, `Wiki/concepts/loop-engineering.md`, `Wiki/index.md`, and append one entry to `Wiki/log.md` without claiming a live proof before it exists.

## Task 1: Define the Deterministic Run Descriptor

**Files:**
- Create: `scripts/loop/workflow-source-descriptor.mjs`
- Create: `scripts/loop/__tests__/workflow-source-descriptor.test.mjs`

**Interfaces:**
- `createWorkflowSourceDescriptor(input)` returns a frozen object with exactly `schemaVersion`, `repositoryId`, `workflowId`, `workflowPath`, `workflowRef`, `runId`, `runAttempt`, `eventName`, `testedSha`, and `pullRequest`.
- `pullRequest` is `null` for non-PR runs, or `{ number, baseSha, headSha, mergeSha }` with three valid SHA values for `pull_request` runs. A missing PR merge SHA makes the descriptor unavailable.
- `serializeWorkflowSourceDescriptor(input)` returns compact UTF-8 JSON bytes from the validated descriptor in the fixed property order above. It never accepts caller-added keys.

- [ ] Write these test cases in `workflow-source-descriptor.test.mjs`: `emits the fixed descriptor in canonical property order`; `rejects malformed IDs, SHA values, workflow paths, and refs`; `requires a complete PR tuple and permits a null tuple only for non-PR events`; `rejects sourceSha and unknown keys`; `returns immutable descriptor bytes without mutating its input`.
- [ ] Run `node --test scripts/loop/__tests__/workflow-source-descriptor.test.mjs` and confirm it fails because the module does not exist.
- [ ] Implement the two exported functions and export `WORKFLOW_SOURCE_DESCRIPTOR_VERSION = 1`; reject malformed fields rather than normalizing ambiguous inputs.
- [ ] Run the focused test again and confirm every descriptor case passes.
- [ ] Commit only these two paths with `feat(loop): define workflow source descriptor`.

The fixture should assert this exact shape and order:

```json
{"schemaVersion":1,"repositoryId":9,"workflowId":42,"workflowPath":".github/workflows/loop-foundation.yml","workflowRef":"refs/pull/17/merge","runId":123,"runAttempt":2,"eventName":"pull_request","testedSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","pullRequest":{"number":17,"baseSha":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","headSha":"cccccccccccccccccccccccccccccccccccccccc","mergeSha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}
```

## Task 2: Add the Opt-In Upstream Attestation Job

**Files:**
- Modify: `.github/workflows/loop-foundation.yml`
- Modify: `scripts/loop/__tests__/workflow.test.mjs`

**Interfaces:**
- The attestation job consumes the current run's `GITHUB_EVENT_PATH`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_REPOSITORY`, `GITHUB_REPOSITORY_ID`, and `GITHUB_API_URL`. It does not use `GITHUB_SHA` as a source or tested-SHA claim.
- The job queries `GET /repos/memories-quy-2002/digital-e-shop/actions/runs/{run_id}` with its read-only `GITHUB_TOKEN` to obtain `workflow_id`, workflow path/ref, and `head_sha` (the descriptor's tested SHA). It takes the PR tuple from the authenticated event payload, requires `head_sha` to match the tuple's head or merge SHA, then writes one descriptor file under `runner.temp`.
- The Node step writes the descriptor to `${{ runner.temp }}/digital-e-loop-workflow-source.json` and emits only its SHA-256 hex digest through `GITHUB_OUTPUT`. `actions/attest` receives the fixed subject name `digital-e-loop-workflow-source.json` and the `sha256:` prefix plus that digest; it does not receive a source-SHA predicate or any issue, prompt, review, log, or credential content.

- [ ] Extend `workflow.test.mjs` to distinguish the existing read-only test job from the new attestation job. Assert the exact pilot label, same-repository guard, `always()` dependency on `test`, no checkout in the attestation job, the pinned `actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6`, the reused pinned setup-node action, fixed subject name/digest format, and the exact per-job permissions.
- [ ] Add the named static cases `attests only labeled same-repository pilot runs after test` and `grants OIDC and attestation write permissions only to the pinned no-checkout producer job`.
- [ ] Run `node --test scripts/loop/__tests__/workflow.test.mjs` and confirm the new assertions fail against the current workflow.
- [ ] Add `labeled` to the existing `pull_request` activity types while retaining `opened`, `reopened`, and `synchronize`. Add an `attest-workflow-source` job that requires the `test` job, runs for the exact pilot label only on a same-repository PR, and still runs after a failed test result.
- [ ] Add the existing full-SHA-pinned `actions/setup-node` action with `node-version: 24.20.0`, then build the descriptor in an inline Node step with `id: descriptor`, sourced from the workflow file, with no checkout and no call into PR-controlled `scripts/loop/**`. Validate the run API response and event fields, write canonical bytes to `${{ runner.temp }}/digital-e-loop-workflow-source.json`, compute SHA-256 with `node:crypto`, and emit the hex digest as the step's `sha256` output. Do not pass `github.workflow_sha` or another claimed source SHA into the descriptor.
- [ ] Add the pinned `actions/attest` step with `subject-name: digital-e-loop-workflow-source.json` and `subject-digest: sha256:${{ steps.descriptor.outputs.sha256 }}`; do not enable registry publishing or storage-record creation.
- [ ] Update `workflow.test.mjs` to assert separate exact action sequences for the existing test job, producer job, and downstream probe workflow; keep it in the fixed test list and run it locally.
- [ ] Commit only the workflow and its test with `feat(loop): attest selected workflow run`.

## Task 3: Verify the Signed Certificate and Issue a Trusted Record

**Files:**
- Create: `scripts/loop/github-workflow-source-attestation.mjs`
- Create: `scripts/loop/__tests__/github-workflow-source-attestation.test.mjs`
- Modify: `scripts/loop/workflow-source-attestation.mjs`
- Modify: `scripts/loop/__tests__/workflow-source-attestation.test.mjs`

**Interfaces:**
- `createGitHubWorkflowSourceAttestationProvider({ repository, execFileImpl })` returns `inspectWorkflowSourceAttestation({ identity, run, snapshot })`, which returns frozen cryptographically verified certificate claims but does not authorize a source SHA.
- The provider computes the expected descriptor locally, writes it as `digital-e-loop-workflow-source.json` in an OS temporary directory, and invokes `gh` with the fixed argument sequence `['attestation', 'verify', descriptorPath, '--repo', repository, '--signer-workflow', repository + '/' + identity.path, '--cert-oidc-issuer', 'https://token.actions.githubusercontent.com', '--format', 'json', '--limit', '30']`. It appends `['--signer-digest', identity.sha]` only when the caller supplies the host's exact allowlisted source SHA; in probe mode without `identity.sha`, it returns certificate claims only and cannot create a trusted record.
- `createWorkflowSourceVerifier({ inspectAttestation })` returns either `null` or a frozen, verifier-owned record with `repositoryId`, `workflowPath`, `workflowRef`, `sourceSha`, `runId`, `runAttempt`, `testedSha`, `descriptorSha256`, and `verifiedAt`, only after comparing certificate claims with the host's exact allowlisted identity and fresh snapshot. `isVerifiedWorkflowSourceRecord(value)` recognizes only records created in the verifier's private `WeakSet`.

- [ ] Add provider cases named `reads the workflow source from githubWorkflowSHA and ignores sourceRepositoryDigest`, `binds the signed certificate to the exact run and attempt`, `omits signer-digest in probe mode but enforces the allowlisted digest in trust mode`, and `rejects predicate-only identity claims`.
- [ ] Add refusal cases for CLI missing/nonzero/timeout/output overflow, malformed JSON, zero or multiple results, 30-result truncation, wrong issuer/repository/workflow/ref/digest, absent or out-of-run verified timestamps, wrong subject digest, wrong run ID, wrong run attempt, and replay against another run or PR tuple.
- [ ] Run `node --test scripts/loop/__tests__/github-workflow-source-attestation.test.mjs scripts/loop/__tests__/workflow-source-attestation.test.mjs` and confirm the new provider contract tests fail before implementation.
- [ ] Implement the provider using `node:child_process` `execFile` only: no shell, fixed argument construction, bounded output and timeout, temporary files outside the checkout, and `finally` cleanup. Require `gh` 2.92.0 or newer. Pass the observe token only through `GH_TOKEN`; keep tokens out of command arguments, logs, and error messages.
- [ ] Parse only `verificationResult.signature.certificate` and `verificationResult.verifiedTimestamps` as trust evidence. Require certificate issuer, workflow repository, `sourceRepositoryIdentifier` equal to the observed repository ID, workflow path/ref and SAN, `githubWorkflowSHA === buildSignerDigest`, exact allowlisted source SHA when in trust mode, subject name `digital-e-loop-workflow-source.json`, descriptor subject SHA-256, run ID, attempt-qualified invocation URI, and a verified timestamp inside the observed run's created/updated interval to match. Never read `statement.predicate` for identity.
- [ ] Replace the boolean verifier result with the immutable verifier-owned record. Remove checks that require caller-provided `run.sourceShaAttested === true` before invoking the provider.
- [ ] Run both focused test files and confirm all failures return unavailable/null and all valid signed-certificate fixtures yield a frozen record that cannot be forged by an equivalent caller-created object.
- [ ] Commit only the provider, verifier, and focused tests with `feat(loop): verify workflow source attestations`.

## Task 4: Wire Verified Evidence Into Read and Rerun Gates

**Files:**
- Modify: `scripts/loop/github-pr-client.mjs`
- Modify: `scripts/loop/__tests__/github-pr-client.test.mjs`
- Modify: `scripts/loop/github-actions-write.mjs`
- Modify: `scripts/loop/__tests__/github-actions-write.test.mjs`

**Interfaces:**
- `createGitHubPrClient(options)` accepts an optional `verifyWorkflowSourceAttestation` function. When absent, required-workflow evidence remains `workflow_source_sha_unattested`.
- Required-workflow evidence invokes the verifier only for one complete exact repository/path/ref/tested-SHA match and returns `sourceSha` only from an immutable verified record that matches the current PR tuple.
- The rerun adapter reads the verifier-owned record from trusted adapter evidence and compares it with the allowlisted `{ repositoryId, path, ref, sha }` before reading jobs or sending any write request.

- [ ] Add PR-client tests named `keeps source unavailable when verifier is absent`, `refuses duplicate workflow matches before attestation lookup`, `refuses stale tuple after certificate verification`, and `returns source SHA only from a matching verifier-owned record`.
- [ ] Add rerun tests named `ignores caller sourceSha and sourceShaAttested fields`, `refuses an unbranded source record before job lookup`, and `accepts only an exact verifier-owned source record before existing attempt, job, approval, and budget checks`.
- [ ] Run `node --test scripts/loop/__tests__/github-pr-client.test.mjs scripts/loop/__tests__/github-actions-write.test.mjs` and confirm the new tests fail against the old boolean/caller-field contract.
- [ ] Wire only the optional verifier interface into both adapters and remove raw `sourceSha`/`sourceShaAttested` properties from normalized API runs. The verifier callback returns the immutable record; raw runs remain untrusted. Preserve read-only PR observation and the existing rerun endpoint; do not alter permissions, approval flow, budget checks, workflow/job allowlists, or Stage 1 activation.
- [ ] Run the same focused tests and confirm the existing stale-tuple, exact-attempt, no-write-before-approval, and budget refusal cases still pass.
- [ ] Commit only these four paths with `fix(loop): trust only verified workflow source records`.

## Task 5: Verify the Hosted Proof With the Read-Only Probe

**Files:**
- Modify: `.github/workflows/loop-source-sha-probe.yml`
- Modify: `scripts/loop/stage1-source-sha-probe.mjs`
- Modify: `scripts/loop/stage1-source-sha-probe-cli.mjs`
- Modify: `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`
- Modify: `scripts/loop/__tests__/workflow.test.mjs`

**Interfaces:**
- `runSourceShaProbe(env, dependencies)` reads the `workflow_run` event, fetches the exact upstream run, and for `pull_request` runs calls `GET /repos/memories-quy-2002/digital-e-shop/pulls?state=all&head=memories-quy-2002:{head_branch}&per_page=100`. It requires one complete page with no `Link: rel="next"`, exactly one same-repository PR, a matching `head.sha`, and valid base/head/merge SHAs before building the descriptor and inspecting that run/attempt's certificate.
- Probe output is frozen bounded metadata: `status`, `runId`, `runAttempt`, `workflowId`, `path`, `testedSha`, and `sourceShaCandidate`. It never returns `sourceShaAttested`, a trusted source record, a statement predicate, a token, a URL, or raw certificate data.
- The downstream probe workflow stays read-only and adds only `attestations: read` and `pull-requests: read` to its existing `actions: read` and `contents: read` permissions. It does not download upstream artifacts or execute upstream code.

- [ ] Replace `summarizeWorkflowSourceShaEvidence` logic that reads `workflow_sha`, `source_sha`, or `workflow_source_sha` from the event/API with a call to the certificate inspector. Those raw fields always remain untrusted, even if they appear later.
- [ ] Add source-probe tests named `reports unavailable for push and old runs`, `reports a certificate-backed candidate for the exact PR run and attempt`, `rejects duplicate or stale PR associations`, and `ignores raw workflow_sha fields and statement predicates`.
- [ ] Run `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs` and confirm the new certificate cases fail before implementation.
- [ ] Extend `loop-source-sha-probe.yml` with `attestations: read` and `pull-requests: read`; keep its repository guard, trusted-default-branch checkout, pinned checkout/setup-node actions, `workflow_run` trigger, and absence of every write permission.
- [ ] Wire `runSourceShaProbe` to the upstream workflow-run API, the exact `pulls?state=all&head=memories-quy-2002:branch&per_page=100` lookup with URL-encoded `branch`, and provider inspection without an allowlisted source SHA. If the upstream run is a push, old, stale, ambiguous, or missing an attestation, report unavailable without fallback.
- [ ] Run the focused source-probe and `workflow.test.mjs` tests; confirm a candidate is emitted only from verified certificate claims and the workflow remains read-only.
- [ ] Commit only the probe workflow, probe module, CLI, and their two test files with `test(loop): verify workflow source attestation evidence`.

The implementation PR's own label-triggered run validates only the producer job. The downstream `workflow_run` observer uses the default-branch version of its workflow, so it can exercise the new verifier only after the implementation PR has been reviewed and merged. The source-SHA-versus-tested-SHA difference is a required hosted proof on a later same-repository PR that does not modify the workflow file. Until that proof is collected, readiness documentation remains pending.

## Task 6: Update Maintainer Guidance

**Files:**
- Modify: `docs/loop-engineering/stage1-cli-runbook.md`
- Modify: `docs/loop-engineering/stage1-readiness.md`
- Modify: `Wiki/concepts/loop-engineering.md`
- Modify: `Wiki/index.md`
- Modify: `Wiki/log.md`

**Acceptance checks:**
- Confirm the implementation PR's `Loop Foundation` run reports the gated producer job without granting workflow write capability.
- After the implementation PR is reviewed and merged, confirm the default-branch read-only probe observes a subsequent run and returns a certificate-backed candidate without granting workflow write capability.
- Confirm the downstream probe parses the exact repository, workflow path/ref, matching `githubWorkflowSHA` and `buildSignerDigest`, and an attempt-qualified `runInvocationURI` whose parsed run ID and attempt equal the fresh API run.
- After that PR is reviewed and merged, apply the pilot label to a later same-repository PR that does not modify `.github/workflows/loop-foundation.yml`; confirm its descriptor tested SHA differs from `githubWorkflowSHA`.
- Confirm no attestation appears for an unlabeled PR or a fork PR, and an old run with no matching attestation remains unavailable.
- Confirm Stage 1 still refuses live reruns for its remaining trust-configuration, job-graph, persisted-budget, and run-attempt-write-binding blockers.

- [ ] Update the runbook with the exact descriptor, CLI prerequisite, opt-in label, host-provider verification procedure, and fail-closed behavior; state that the attestation provider alone does not enable Stage 1.
- [ ] Update readiness and Wiki pages with only locally verified implementation facts. Record the source-SHA-versus-tested-SHA hosted proof as pending until the later run supplies certificate evidence; retain all unrelated Stage 1 blockers.
- [ ] Bump the Wiki index date and append one concise line to `Wiki/log.md` if the Wiki is changed.
- [ ] Run the full fixed Loop Foundation test list from `.github/workflows/loop-foundation.yml`, then run the three existing verification smoke commands from that workflow.
- [ ] Run `git diff --check` and inspect the complete diff for secret exposure, broad workflow permissions, caller-trusted flags, predicate-based identity, or Stage 1 activation.
- [ ] Commit only the five documentation paths with `docs(loop): document source attestation boundary`.

## Review Focus

- The attestation job is opt-in, same-repository only, and does not execute PR-controlled code while holding OIDC/attestation permissions.
- Every new write permission is limited to the attestation job and exactly justified by the pinned action; there is no `actions: write` or `contents: write`.
- The host derives the descriptor and expected subject digest from its own fresh run/PR observations, checks fixed subject name `digital-e-loop-workflow-source.json`, then verifies the GitHub certificate and exact run attempt.
- The certificate source digest is read from `githubWorkflowSHA` and required to equal `buildSignerDigest`; `sourceRepositoryDigest`, `github.sha`, the statement predicate, and caller fields cannot substitute.
- The downstream `workflow_run` probe observes the exact upstream run and attempt with read-only permissions and emits only untrusted feasibility metadata, never a trusted source record.
- Missing, multiple, stale, tampered, truncated, or unavailable attestation evidence remains a hard refusal.
- The existing policy, Stage 1 disable state, approval requirements, budget gates, and run-attempt write race remain unchanged.

## References

- [GitHub CLI `gh attestation verify`](https://cli.github.com/manual/gh_attestation_verify): signature verification, signer constraints, JSON certificate fields, and the warning that statement predicate values are workflow-controlled.
- [GitHub `actions/attest` v4.2.2](https://github.com/actions/attest/tree/v4.2.2): pinned action, subject-name/subject-digest inputs, and job permission requirements.
- [Sigstore verification result example](https://github.com/sigstore/sigstore-go/blob/main/docs/verification.md#verification-result): `githubWorkflowSHA`, `buildSignerDigest`, repository/ref claims, and attempt-qualified `runInvocationURI`.
- [Approved design spec](../specs/2026-10-07-stage1-oidc-workflow-source-attestation-design.md): trust boundary, failure behavior, and Stage 1 gates.
