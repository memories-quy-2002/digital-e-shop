# ADR 0007: Hosted Stage 0 observer and report-only Check Run

**Status:** Accepted policy; publisher implementation and deployment remain inactive until separately reviewed and approved.

## Context

The hosted Stage 0 observer needs to remain read-only while a separate optional
publisher may surface a bounded observation in a pull request's Checks tab.
GitHub's `checks:write` permission also authorizes Check Run re-requests and
Check Suite create, preference-update, and re-request endpoints. Repository
scoping alone does not limit an installation token to the intended Check Run.

## Decision

- Keep the PR observer read-only and separate from the report publisher.
- Give a future publisher only a transport-level allowlist for Check Run create
  (`POST /repos/{owner}/{repo}/check-runs`) and update
  (`PATCH /repos/{owner}/{repo}/check-runs/{check_run_id}`), plus the fixed
  read-only lookup needed to find its own report. Reject all other writes,
  including Check Run re-requests, Check Suite creation/preferences/re-requests,
  Actions reruns, issue/comment writes, contents writes, and merges.
- Publish only a bounded `Loop Engineering Stage 0` report attached to the
  freshly revalidated PR head SHA, always with `neutral`. Revalidate the PR
  tuple and complete required-check policy immediately before publishing. If
  policy is incomplete or the report context is required, refuse publication.
- The report context is never a required check and never conveys merge
  readiness. GitHub lists `neutral` as a successful conclusion for required
  status checks, so a neutral report could satisfy a merge gate if configured
  as required; it is not a substitute for required CI or human review.
- Do not grant the publisher `actions:write` or `contents:write`. This proposed
  policy does not authorize App permission changes, host implementation, or
  deployment. Review and merge it separately; begin implementation in a fresh
  run from that reviewed policy revision.

## Consequences

The App's permission is broader than the publisher's intended operation, so
the fixed API client allowlist and negative endpoint tests are security
boundaries. The observer remains useful if publication is disabled or refused.

## References

- [GitHub App permissions required for REST API endpoints](https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps)
- [Using the REST API to interact with checks](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-checks)
- [GitHub status checks and conclusions](https://docs.github.com/en/pull-requests/reference/status-checks)
