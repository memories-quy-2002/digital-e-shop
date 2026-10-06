# Stage 1 Source SHA Feasibility Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to implement this plan task-by-task.

**Goal:** Capture the GitHub-generated `workflow_run` event and matching REST run fields for `Loop Foundation` in a bounded read-only probe, then establish whether either source exposes an upstream workflow source SHA.

**Architecture:** A Node module isolates one fixed-origin Actions run reader from a pure event/API comparison helper; the reader accepts an injected `fetch` so transport failures can be unit-tested. A small CLI reads the GitHub-provided event file, calls both functions, and emits only allowlisted metadata. A new default-branch `workflow_run` workflow invokes the CLI with `contents:read` and `actions:read`; it never checks out PR code, downloads artifacts, creates attestations, or requests write permissions.

**Tech Stack:** GitHub Actions `workflow_run`, Node.js 24.20.0, Node built-in test runner, GitHub Actions REST API.

**Spec:** [Stage 1 workflow source attestation and job allowlist](../specs/2026-10-05-stage1-workflow-attestation-design.md)

## Global Constraints

- A workflow source SHA is accepted only when it is present in GitHub-generated evidence tied to the exact run; never infer it from a workflow name, path, ref, PR SHA, display name, or PR-controlled content.
- The probe uses GitHub API reads only and emits bounded identifiers, SHA values, and status codes.
- The probe never checks out PR code, downloads upstream artifacts, executes upstream content, or creates an attestation.
- Grant only `contents:read` and `actions:read`; do not grant `id-token:write`, `attestations:write`, `actions:write`, or `contents:write`.
- The Stage 1 CLI must continue to return `workflow_source_sha_unattested` when no independently observed candidate exists.
- This probe does not resolve `run_attempt_write_binding_unavailable`, approve a job graph, initialize a host budget session, select a pilot, or authorize a rerun.
- Exact high-risk paths in this plan are `.github/workflows/loop-source-sha-probe.yml`, `.github/workflows/loop-foundation.yml`, and `scripts/loop/**`.

## Review Focus

- Event run ID, repository ID, workflow ID, path, attempt, or tested SHA differs from the fresh API response: fail with a bounded mismatch code and do not report a source SHA.
- Neither event nor API response exposes a source SHA field: report `source_sha_unavailable`; do not infer one from `head_sha`.
- Event and API expose different source SHA candidates: report `source_sha_mismatch`; do not choose either value.
- GitHub API responds with an error, redirect, malformed JSON, or wrong run: fail without printing the response body or token.
- A non-target repository or workflow triggers the event: produce no metadata record.

---

## Files and responsibilities

- Create `scripts/loop/stage1-source-sha-probe.mjs`: provide a fixed-origin run reader with injectable `fetch` plus a pure event/API join that produces a frozen, bounded diagnostic result.
- Create `scripts/loop/stage1-source-sha-probe-cli.mjs`: read the trusted event file, fetch the exact upstream run from GitHub, call the pure helper, and print one bounded result.
- Create `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`: exercise the valid join, absent source SHA, mismatch, and malformed-field cases with Node's built-in test runner.
- Create `.github/workflows/loop-source-sha-probe.yml`: run the helper only from the default-branch workflow context after `Loop Foundation` completes; use a read-only token and no upstream artifact/code.
- Modify `.github/workflows/loop-foundation.yml`: include the new helper test in its fixed hosted test command.

### Task 1: Add the bounded event/API comparison helper and unit tests

**Files:**
- Create: `scripts/loop/stage1-source-sha-probe.mjs`
- Create: `scripts/loop/stage1-source-sha-probe-cli.mjs`
- Create: `scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`

**Interfaces:**
- Export `summarizeWorkflowSourceShaEvidence({ event, apiRun, expected })` from `scripts/loop/stage1-source-sha-probe.mjs`.
- Export `fetchUpstreamWorkflowRun({ runId, token, fetchImpl = fetch })` from the same module. It accepts only a positive safe-integer run ID and calls only the fixed repository run endpoint.
- `stage1-source-sha-probe-cli.mjs` is the executable entry point; it reads `GITHUB_EVENT_PATH`, `GITHUB_REPOSITORY`, and `GITHUB_TOKEN` and calls the pure helper.
- `event` is the parsed GitHub event envelope; `event.workflow_run` is the upstream run.
- `apiRun` is the parsed response from `GET /repos/{owner}/{repo}/actions/runs/{run_id}`.
- `expected` is exactly `{ repositoryId: 743050379, workflowId: 368298853, path: '.github/workflows/loop-foundation.yml' }`.
- Return a frozen object with `status` (`candidate_present`, `source_sha_unavailable`, `source_sha_mismatch`, `run_identity_mismatch`, or `not_target`), `runId`, `runAttempt`, `workflowId`, `path`, `testedSha`, `eventSourceSha`, and `apiSourceSha`. Source candidate fields are only `workflow_sha`, `source_sha`, and `workflow_source_sha`; absent candidates are `null`. A `not_target` result contains no run identifiers or SHA values.

- [x] **Step 1: Write the failing unit tests** for:
  - matching event/API identity with no source candidate returns `source_sha_unavailable` and null source fields;
  - matching valid source candidates in both objects returns `candidate_present` with the same SHA;
  - conflicting source candidates returns `source_sha_mismatch`;
  - a wrong envelope/API repository ID, workflow ID, or workflow path returns `not_target` without run identifiers or SHA values;
  - a wrong run ID, attempt, or `head_sha` returns `run_identity_mismatch`;
  - malformed source SHA returns `source_sha_mismatch`;
  - returned result is frozen and contains no arbitrary event/API fields.
  - `fetchUpstreamWorkflowRun` requests the fixed URL with manual redirects and required GitHub headers;
  - redirect/non-2xx, malformed JSON, and transport errors return stable error codes without response bodies or tokens.

- [x] **Step 2: Run the focused tests and confirm they fail**

Run: `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`

Expected: test discovery succeeds and the tests fail because the export does not exist.

- [x] **Step 3: Implement the pure comparison helper**

Implement `summarizeWorkflowSourceShaEvidence({ event, apiRun, expected })` with these rules:

1. Read only the named fields in the interface. Return `not_target` with no run identifiers or SHA values if `event.repository.id`, `apiRun.repository.id`, `event.workflow_run.workflow_id`, `event.workflow_run.path`, `apiRun.workflow_id`, or `apiRun.path` differs from `expected`.
2. For a target run, validate the event/API run ID, integer attempt, and 40-character hexadecimal `head_sha` equality before examining source candidates. Return `run_identity_mismatch` if a required value is missing or differs.
3. Read `workflow_sha`, `source_sha`, and `workflow_source_sha` from `event.workflow_run` and `apiRun`; accept only 40-character hexadecimal values and normalize them to lowercase.
4. Return `source_sha_mismatch` if a present candidate is malformed or event/API candidates conflict.
5. Return `candidate_present` only when at least one valid candidate exists; return `source_sha_unavailable` when none exists. A `head_sha` is never a source-SHA candidate.
6. Return `Object.freeze()` over a new object containing only the declared fields. Do not mutate the inputs or throw input-derived text.

In the same module, implement `fetchUpstreamWorkflowRun({ runId, token, fetchImpl = fetch })`. Construct the URL only from the fixed repository and validated numeric run ID. Send `Accept: application/vnd.github+json`, `Authorization: Bearer ${token}`, and `X-GitHub-Api-Version: 2022-11-28` with `redirect: 'manual'`. Map network failure to `upstream_run_transport_error`, non-2xx/redirect to `upstream_run_http_error`, and invalid JSON to `upstream_run_invalid_json`; never include response text, URL input, or token in thrown messages.

- [x] **Step 4: Run the focused tests and confirm they pass**

Run: `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`

Expected: all source-SHA probe unit tests pass.

### Task 2: Add the read-only `workflow_run` probe and hosted unit-test coverage

**Files:**
- Create: `.github/workflows/loop-source-sha-probe.yml`
- Modify: `.github/workflows/loop-foundation.yml`

**Interfaces:**
- The probe workflow handles `workflow_run.completed` events filtered to the `Loop Foundation` workflow name, then validates the exact repository/workflow IDs and path using Task 1's helper.
- It checks out only `${{ github.sha }}` from the trusted default-branch workflow context, with `persist-credentials: false` and the repository's existing full-SHA-pinned checkout action.
- The CLI reads `GITHUB_EVENT_PATH`, fetches the triggering run by its numeric ID using `fetchUpstreamWorkflowRun`, and sends parsed values to `summarizeWorkflowSourceShaEvidence`.
- The CLI's only output is the helper's bounded JSON result. It does not print raw event/API objects, response bodies, branch names, PR content, or token values. It prints nothing for `not_target`.

- [x] **Step 1: Add the probe test to the fixed hosted test command** in `.github/workflows/loop-foundation.yml`:

```yaml
            scripts/loop/__tests__/stage1-source-sha-probe.test.mjs \
```

- [x] **Step 2: Add `.github/workflows/loop-source-sha-probe.yml`** with:
  - `workflow_run` filtered to `workflows: ["Loop Foundation"]` and `types: [completed]`;
  - workflow and job permissions limited to `actions: read` and `contents: read`;
  - one Ubuntu job that checks `github.repository` equals `memories-quy-2002/digital-e-shop`;
  - checkout of `github.sha` using the same pinned `actions/checkout` SHA as `loop-foundation.yml`, with `persist-credentials: false`;
  - setup Node from `.node-version` using the same pinned `actions/setup-node` SHA as `loop-foundation.yml`;
  - one Node step that parses only `GITHUB_EVENT_PATH`, validates the repository and numeric run ID, makes `GET https://api.github.com/repos/memories-quy-2002/digital-e-shop/actions/runs/{run_id}` with `redirect: 'manual'`, rejects every non-2xx response without printing its body, calls the helper, and prints only its JSON result;
  - no `actions/attest`, OIDC, artifact download, PR checkout, `actions:write`, or `contents:write`.

Use this exact workflow structure; the CLI owns all event/API parsing so the workflow shell never interpolates upstream fields:

```yaml
name: Loop source SHA probe

on:
  workflow_run:
    workflows: ["Loop Foundation"]
    types: [completed]

permissions:
  actions: read
  contents: read

jobs:
  probe:
    if: github.repository == 'memories-quy-2002/digital-e-shop'
    runs-on: ubuntu-24.04
    permissions:
      actions: read
      contents: read
    steps:
      - name: Checkout trusted default-branch source
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          ref: ${{ github.sha }}
          persist-credentials: false

      - name: Set up Node.js
        uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version-file: .node-version

      - name: Compare event and API run metadata
        env:
          GITHUB_TOKEN: ${{ github.token }}
        run: node scripts/loop/stage1-source-sha-probe-cli.mjs
```

In the CLI, require `GITHUB_REPOSITORY` to equal the fixed repository, parse `GITHUB_EVENT_PATH`, require a positive safe-integer upstream run ID, and call `fetchUpstreamWorkflowRun({ runId, token: process.env.GITHUB_TOKEN })`. Exit non-zero on its stable error codes without printing response bodies or tokens. For a valid target event, print only the helper's frozen result as one JSON line; for `not_target`, print nothing.

- [x] **Step 3: Check the diff and run the focused unit test**

Run: `git diff --check`

Expected: exit code 0 and no whitespace errors.

Run: `node --test scripts/loop/__tests__/stage1-source-sha-probe.test.mjs`

Expected: all focused tests pass.

- [x] **Step 4: Run the full fixed Loop Engineering suite locally**

Run: `node --test scripts/loop/__tests__/*.test.mjs`

Expected: all tests pass; the new probe tests are included.

- [ ] **Step 5: Verify hosted checks on the reviewed PR head**

Expected: required `Loop Foundation / test` and the repository's other required CI/security checks pass. The new probe's workflow run is informational and must not be added as a required check or ruleset workflow.

**Trigger boundary:** GitHub only runs `workflow_run` listeners that are present on the default branch. The PR containing this new workflow cannot produce a probe result for itself. After the workflow is reviewed and merged through the repository's normal human-controlled process, a subsequent `Loop Foundation` completion on the default branch can produce the first live probe observation. Do not record a local fixture as that observation.

### Task 3: Record the feasibility result without enabling Stage 1

**Files:**
- Modify: `docs/loop-engineering/stage1-readiness.md`
- Modify: `docs/loop-engineering/stage1-cli-runbook.md`

**Interfaces:**
- The only accepted probe result is the bounded JSON from Task 2 tied to its upstream `runId`, `runAttempt`, workflow ID/path, tested SHA, and event/API source-SHA candidates.
- A present candidate is evidence for another design review only. It is not an attestation, trusted provider result, pilot observation, or rerun authorization.

- [ ] **Step 1: Record the result in the readiness evidence** with the upstream run ID, attempt, tested SHA, candidate-presence status, and evidence source. Do not record the raw event payload or API response.
- [ ] **Step 2: Keep the CLI runbook fail-closed**. If no authenticated source SHA is present, retain `workflow_source_sha_unattested`; if a candidate is present, state that the source-provider design needs a separate spec review before implementation.
- [ ] **Step 3: Re-read both documents and run `git diff --check`**

Expected: the documents report only observed bounded metadata and do not claim that Stage 1 is enabled or promotion-ready.

## Execution gates

- Do not merge this probe until the maintainer has reviewed its exact workflow path and all required checks pass.
- If the observed event/API payload has no source-SHA candidate, stop after Task 3. Keep Stage 1 blocked and request a separate spec review for any change to the source identity contract; do not implement an attestation provider from `head_sha`, path, ref, or check name.
- If a candidate appears, stop after recording evidence. Verify its documented meaning and exact-run binding in GitHub's primary documentation, then write a separate provider implementation plan for review.
- This plan does not resolve the run/attempt atomic-write limitation. No live rerun is allowed under either outcome.
- The current raw REST baseline for PR run `37407627321` has `workflow_id=368298853`, path `.github/workflows/loop-foundation.yml`, `run_attempt=1`, and a tested `head_sha`, but no `workflow_sha`, `source_sha`, or `workflow_source_sha` field. The probe checks whether the GitHub-generated event envelope carries an additional source-SHA value.

## Self-review

- Spec coverage: this plan addresses source-SHA feasibility and the raw event/API boundary only. It deliberately does not implement the attestation provider, job graph allowlist, budget session, trusted approver setup, pilot collection, or rerun writer; each stays a separate gate in the approved spec.
- Placeholder scan: no implementation step relies on an unspecified provider, trust root, credential, or source-SHA field. The only open result is the explicit feasibility gate above.
- Type consistency: the helper uses the single declared interface and status union in Tasks 1 and 2.
- Review focus: each mismatch class fails closed, absence remains unavailable, and API errors do not expose response content.
- Proportion: three tasks are limited to a metadata-only probe and bounded documentation update; no signing or write capability is introduced.
