# Stage 1 pilot checklist

**Updated:** 2026-10-12
**Status:** Prepared only; no live pilot or new promotion observations.

Use the [CLI runbook](stage1-cli-runbook.md) for trusted-main invocation,
configuration paths and interactive commands. Store bounded observation rows
in [readiness](stage1-readiness.md); never store secrets, tokens, raw logs or
approval bodies. Local fixtures do not count as hosted observations.

## Gate A: reviewed implementation

- [ ] The final implementation head has complete required CI, including
  client/server, Loop Foundation, dependency review, CodeQL and GitGuardian.
- [ ] A human reviewer approves the final head and configuration boundary.
- [ ] The maintainer confirms and merges into `main`; no direct push or bypass.
- [ ] A clean trusted-main checkout matches canonical current `main` exactly.

PR #304 at `23d00d04ac74c1e2af81b3efa6e96e7c2717960a` has successful observed
checks, but those checks do not cover the newer local token/policy changes.
The current review listing has no human approval. PR #304 edits workflows and
is not an eligible recovery pilot.

## Gate B: effective permissions and identities

- [ ] Dedicated policy-reader App installed only on this repository, with all
  six read-only permissions listed in the runbook. Verify effective
  installation grants rather than inferring them from App settings.
- [ ] Environment `stage1-policy-reader` restricts branches to `main`; configure
  human review where supported. Set `STAGE1_POLICY_APP_CLIENT_ID` and
  `STAGE1_POLICY_APP_PRIVATE_KEY` directly in environment Settings.
- [ ] Verify the pinned token action requests one repository, only read
  permissions, and automatic post-job revocation. Never share its token across
  jobs or give the policy-reader key write privileges.
- [ ] Dispatcher App is separately granted its reviewed observe,
  source-attestation-read and Actions-write scopes; the policy reader cannot
  dispatch and does not replace the authenticated TTY approver.
- [ ] Configure local host App identifiers and an external private-key file
  through the runbook. Verify numeric approver and dispatcher actor IDs before
  creating the fixed user-local trust file; do not guess the bot ID.
- [ ] GitHub CLI meets the attestation verifier's documented minimum version.

The 2026-10-12 audit has no host credentials or trust file. Connector reads
branch protection with HTTP 403; that connector is not the dispatcher App.
No App configuration or secret provisioning was performed.

## Gate C: one selected eligible PR

- [ ] Maintainer selects an open, non-draft, same-repository feature PR based
  on current `main`, without workflow/action changes or protected/infrastructure
  failure evidence. Observe its exact head/base/merge tuple afresh.
- [ ] Collect complete current rules, Check Runs, workflow runs and file diff.
  Require exactly one supported failed `client` or `server` check from App
  15368 and a genuine `same_revision_pass_then_fail` classification.
- [ ] No tests, policy or persisted evidence are disabled or edited to create
  retry eligibility. If no eligible flaky failure exists, wait rather than
  manufacture one or reinterpret normal green CI as pilot evidence.
- [ ] The matching PR worktree is clean. Initialize its budget from reviewed
  trusted-main code after exact `INITIALIZE <pr>` confirmation. Keep canonical
  `ciRunLimit: 2` and never overwrite or reset counters.

Only PR #304 was open in the audit. No eligible pilot PR has been selected.

## Gate D: one approved recovery and its evidence

- [ ] Inspect through the trusted CLI, authenticate the approver and confirm
  the exact target in a real TTY. Do not automate or synthesize approval.
- [ ] Record the returned workflow run ID and reserved attempt key. A missing
  run ID or uncertain response escalates without a second dispatch.
- [ ] Independently observe exact repository, source SHA, actor, request ID,
  PR tuple and attestation. All three jobs (`verify`, `attest`, `publish`) must
  succeed; the verifier must test the approved SHA and original context.
- [ ] Verify publisher policy reads succeed with the reader token; its failure
  yields zero PATCH. The Actions token updates only the original Check Run ID.
- [ ] Independently read that Check Run's App ID, name, SHA and success result,
  and fresh branch-protection evidence that recognizes it. A workflow success
  alone does not complete recovery.
- [ ] Confirm `ready-for-human` only from fresh unchanged tuple/policy evidence;
  record CI budget consumption and token revocation evidence without tokens.

## Gate E: promotion evidence

- [ ] Collect at least ten representative failed/pending PR observations and
  the ten bounded rerun decisions required by the Phase 2 runbook, across
  approved sessions and eligible PRs. Never exceed the two-run session budget
  to reach a sample count.
- [ ] Zero stale-SHA actionable decisions, protected/infrastructure
  misclassifications, duplicate dispatches or retry-budget overruns.
- [ ] For hosted Stage 0 promotion, independently prove consumer completion,
  Check Run publication and deployed-source correlation; cron completion
  alone is insufficient.
- [ ] Update readiness with bounded metadata and evidence links; then obtain
  the maintainer's promotion review. Merge remains human-controlled.

Required observation fields: `observedAt`, repository/PR IDs, base/head/merge
SHAs, tested SHA, required context/App ID, Check Run ID, workflow run/attempt,
classification, reason code, outcome and evidence kind. No rows are filled in
this checklist because no qualifying live observation has been collected.
