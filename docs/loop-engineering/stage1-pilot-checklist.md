# Stage 1 pilot checklist

**Updated:** 2026-10-12
**Status:** Implementation merged; live pilot and promotion evidence pending.

Use the [CLI runbook](stage1-cli-runbook.md) for trusted-main invocation,
configuration paths and interactive commands. Store bounded observation rows
in [readiness](stage1-readiness.md); never store secrets, tokens, raw logs or
approval bodies. Local fixtures do not count as hosted observations.

## Gate A: reviewed implementation

- [x] The final implementation head has complete required CI, including
  client/server, Loop Foundation, dependency review, CodeQL and GitGuardian.
- [ ] Record a human review of the final head and configuration boundary. The
  project review rule remains unmet if merge occurred without a review.
- [x] The maintainer merged the implementation into `main`; no direct push or
  bypass.
- [ ] A clean trusted-main checkout matches canonical current `main` exactly.

PR #304 was merged into `main` at `875eb82e0886edd622737136eb6a8f5fbbd313ae`
on 2026-10-12. Its implementation CI completed successfully. A live GitHub
search on 2026-10-12 found no open PRs, so there is no current pilot target.
This local branch is `feature/stage1-trusted-dispatch` at
`090c12f4d93465d503ca967a853d96432170a889`, behind the locally recorded
`origin/main`; it is not the clean trusted-main checkout required for pilot
operations.

## Gate B: effective permissions and identities

- [x] Dedicated policy-reader App installed only on this repository, with all
  six read-only permissions listed in the runbook. Verify effective
  installation grants rather than inferring them from App settings.
- [x] Environment `stage1-policy-reader` restricts branches to `main`, requires
  reviewer `memories-quy-2002`, blocks self-review, and contains
  `STAGE1_POLICY_APP_CLIENT_ID` plus encrypted `STAGE1_POLICY_APP_PRIVATE_KEY`.
- [x] Verify the pinned token action requests one repository, only read
  permissions, and automatic post-job revocation. Never share its token across
  jobs or give the policy-reader key write privileges.
- [x] Dispatcher App installation is limited to this repository and has the
  reviewed observe, source-attestation-read and `actions:write` scopes; the
  policy reader cannot dispatch and does not replace the authenticated TTY
  approver.
- [ ] Re-verify local host App identifiers and the external private-key file
  through the runbook. Verify numeric approver and dispatcher actor IDs before
  creating the fixed user-local trust file; do not guess the bot ID.
- [ ] Verify GitHub CLI meets the attestation verifier's documented minimum version
  (`2.102.0`).

Effective App permissions and environment protection were previously verified
on 2026-10-12; the environment secret was verified through metadata only. Local
host trust identities and the CLI are not verified in this session. Never read
back or print the environment secret value.

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

The latest open-PR check found no PRs. No eligible pilot PR has been selected.

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

## Gate E: Stage 1 activation and later promotion

- [ ] Before enabling Stage 1, collect the ten representative failed/pending
  PR observations required for promotion from Stage 0 to Stage 1. Current
  readiness evidence records 0 of 10; do not substitute fixtures or fabricate
  flaky failures.
- [ ] Zero stale-SHA actionable decisions, protected/infrastructure
  misclassifications, duplicate dispatches or retry-budget overruns in the
  Stage 1 pilot.
- [ ] For hosted Stage 0 promotion, independently prove consumer completion,
  Check Run publication and deployed-source correlation; cron completion
  alone is insufficient.
- [ ] Update readiness with bounded metadata and evidence links; keep the
  promotion decision human-controlled.

Collecting ten bounded rerun decisions is a separate promotion gate from Stage
1 to Stage 2. Stage 2 is deferred by the maintainer and is outside this task.
Do not spend CI budget or run repair work to satisfy that later gate now.

Required observation fields: `observedAt`, repository/PR IDs, base/head/merge
SHAs, tested SHA, required context/App ID, Check Run ID, workflow run/attempt,
classification, reason code, outcome and evidence kind. No rows are filled in
this checklist because no qualifying live observation has been collected.
