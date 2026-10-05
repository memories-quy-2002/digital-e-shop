# Hosted Loop Engineering Stage 0 runbook

**Updated:** 2026-10-05
**Status:** The Cloudflare Worker, D1 database, both Queues, and production Worker secret names are provisioned. Their secret values were not inspected. The active Worker deployment has no verified provenance from the protected GitHub `workflow_dispatch` workflow. The GitHub App is installed only on `memories-quy-2002/digital-e-shop`, but it has no subscribed webhook events and its configured URL still points to `/` instead of `/webhook`. The installation still needs `contents:read` and `checks:write`. The `hosted-stage0-production` environment allows only `main` and requires maintainer review; `CLOUDFLARE_ACCOUNT_ID` is set, but `CLOUDFLARE_API_TOKEN` is not. A trusted `main` deployment and live PR pilot remain pending.

## What runs where

The Cloudflare Worker receives signed GitHub webhooks, places bounded PR routing metadata on a Queue, observes the configured repository through a repository-scoped GitHub App installation token, stores idempotency/state metadata in D1, and publishes a bounded `Loop Engineering Stage 0` Check Run. A 15-minute Cron Trigger pages through open PRs to recover missed webhook events. It does not check out PR code, rerun Actions, modify branches, merge PRs, or access Digital-E commerce production data.

The top-level D1 binding is for local development and uses Wrangler's local D1 storage. Keep its ID separate from the production D1. If remote preview development is needed, provision a dedicated preview D1 and set `preview_database_id`; never point remote preview at production.

The Check Run is informational. It is always `neutral`, is attached to the current PR head SHA, and must not be added to branch protection or rulesets as a required check. The report says explicitly that it does not grant merge readiness. If the current PR tuple or required-check policy changes, is incomplete, or requires this report context, publication is refused. Required workflow evidence remains unavailable without a trusted source-SHA attestation.

## Production bootstrap checklist

Complete these only after explicit approval for Task 8:

1. Create the GitHub App for the single intended repository. Enable its webhook and select **Pull requests** and **Check runs**. The Worker queues only `opened`, `reopened`, `synchronize`, `ready_for_review`, and `edited` PR actions; its own report Check Run event is ignored to prevent a feedback loop.
2. Install the App only on `memories-quy-2002/digital-e-shop`. Review the App's repository permissions before installation: `contents:read`, `pull_requests:read`, `checks:read`, `actions:read`, and `administration:read` for observation and canonical policy; add `checks:write` only for the separately scoped report token. The report token requests only the Check Runs capability. Do not grant `actions:write`, `contents:write`, administration write, or merge permissions.
3. Create the Cloudflare D1 database `digital-e-loop-stage0` and the Queues `digital-e-loop-stage0-events` and `digital-e-loop-stage0-dead-letter`. Replace the production D1 placeholder ID in `scripts/loop/hosted/cloudflare/wrangler.jsonc` with the returned ID. Keep the local D1 binding out of production.
4. Replace the public App/repository identifier sentinels in the `production.vars` block with verified values. Keep `STAGE0_CHECK_RUN_NAME` exactly `Loop Engineering Stage 0`. These values are not secrets.
5. Apply the D1 migration to the new production database, then verify the binding and Queue names against Wrangler configuration:

   ```powershell
   pnpm --dir scripts/loop/hosted/cloudflare exec wrangler d1 migrations apply digital-e-loop-stage0 --remote --env production
   pnpm --dir scripts/loop/hosted/cloudflare exec wrangler queues list
   ```

6. Store only `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET` as Cloudflare Worker secrets. Use `wrangler secret put <NAME> --env production`; never put secret values in Git, `wrangler.jsonc`, a GitHub Actions variable, or a PR workflow. Keep the private key restricted to the Worker. Rotate the App key by adding a replacement key in GitHub, updating the Cloudflare secret, verifying the Worker, then revoking the old key. Webhook-secret rotation requires a short ingress pause because this Worker accepts one secret at a time: pause ingress, update both GitHub and Cloudflare, then resume.
7. Configure GitHub Actions environment `hosted-stage0-production` with `main` as its only allowed deployment branch and require a maintainer reviewer where the repository plan supports environment approvals. Add a minimal, single-account `CLOUDFLARE_API_TOKEN` as an environment secret and `CLOUDFLARE_ACCOUNT_ID` as an environment variable. Scope the token only to permissions needed to deploy this Worker and its precreated D1/Queue bindings; do not grant zone DNS, account administration, or unrelated product permissions. Do not put the GitHub App key or webhook secret in GitHub Actions.
8. Set the GitHub App webhook URL to the deployed Worker URL with `/webhook`, then deliver a test webhook and verify signature rejection and accepted delivery behavior. The App and Worker should observe only the configured repository.

## Verification and deployment workflow

`.github/workflows/deploy-loop-stage0.yml` runs on relevant pull requests and pushes to `main` with only `contents:read`. Those jobs install the locked Worker package, run its Node and Worker tests, and typecheck it. They receive no Cloudflare token, App key, webhook secret, production bindings, or writable GitHub token. The workflow uses full-length action commit pins and disables credential persistence and package-manager caching. The production Wrangler dry run is a separate local verification step and is not run against PR code.

The same workflow has a manual `workflow_dispatch` deploy job, guarded so it can run only from `main`, after verification, and through `hosted-stage0-production`. The Cloudflare token is exposed only to the final Wrangler deploy step. `synchronize_dashboard_config` defaults to `false`, which keeps deployment strict. Enable it only when applying the reviewed `main` configuration to resolve a known Dashboard drift; this explicitly allows Wrangler to replace remote settings. A dry run validates a bundle but does not perform that synchronization, provision queues/databases, or create production secrets. Wrangler environments have independent bindings, so the production D1 and Queue bindings must be declared under `env.production`.

Before the first deployment, confirm that `main` contains the reviewed code and that the protected environment, Cloudflare resources, D1 ID, production vars, and Worker secrets are all correct. Do not dispatch the deployment as part of this implementation task.

## Where to observe runs

- **GitHub PR → Checks:** find `Loop Engineering Stage 0`; confirm its conclusion is `neutral`, its SHA is the current PR head, and it is not required by branch protection/rulesets. The output contains only an observation timestamp, bounded action/reason codes, and a short policy-fingerprint prefix.
- **Cloudflare dashboard → Workers & Pages → `digital-e-loop-stage0-production` → Logs/Observability:** inspect stable reason codes such as `stage0_queue_message_retry` and `stage0_scheduled_reconciliation_failed`. Logs intentionally omit exception text, PR/review bodies, secrets, and raw CI logs.
- GitHub App token failures are classified without logging the response body or credentials: `github_auth_token_request_timeout`, `github_auth_token_request_network_error`, `github_auth_token_request_redirect_rejected`, or `github_auth_token_request_http_<status>` identify the failure boundary. Known HTTP responses retain their specific unauthorized/forbidden/not-found/rate-limit codes. Use the HTTP status to check GitHub status and App/installation configuration; never paste a key or token into logs or support requests.
- **Cloudflare dashboard → Queues:** inspect backlog, consumer failures, and the dead-letter Queue. Messages that exhaust the configured three retries are not automatically replayed from the dead-letter Queue; investigate the reason first, then redeliver only after the cause is corrected.
- **GitHub App → Advanced → Recent deliveries:** inspect webhook response status and redeliver a failed delivery if appropriate. The scheduled open-PR scan also recovers missed deliveries.
- **GitHub Actions → Hosted Loop Stage 0:** inspect the secret-free PR/main verification or an explicitly dispatched, protected production deployment.

If a scheduled invocation reports `reconciliation_failed` with no outbound GitHub spans, check the production bindings before treating it as a network error. A missing or invalid GitHub runtime configuration throws before D1/GitHub calls and is currently logged with this fallback code. From `scripts/loop/hosted/cloudflare`, run `pnpm exec wrangler secret list --env production` and inspect the affected version with `pnpm exec wrangler versions view <VERSION_ID> --env production`; these commands show secret names, not values. Production requires `GITHUB_APP_PRIVATE_KEY` and `GITHUB_WEBHOOK_SECRET`. The `production.secrets.required` declaration inherits these bindings and makes an upload fail if a required secret is missing. Restore missing values on the production Worker's Settings page or with `wrangler secret put <NAME> --env production`, then verify the active version's binding names and a subsequent reconciliation sweep. A new `last_completed_at` records sweep completion, not completion of downstream Queue processing.

## Bounds and free-plan operations

Current code caps an invocation at 38 observer API subrequests, 8 report-lookup pages, 20 open PRs per reconciliation page, and 10 messages per consumer call. This leaves room under the 50 external subrequest ceiling for separate App-token requests, report lookup, and Check Run write. Wrangler sets the consumer batch size to one, three retries, a dead-letter Queue, and a 15-minute cron interval. One successful cron tick scans at most 20 PRs. For a stable set of `N` open PRs, the nominal full-sweep time is `15 minutes × ceil(N / 20)`, assuming GitHub/Cloudflare availability, no backlog, and successful page delivery; this is a target, not a service guarantee.

Cloudflare's current Free plan documents 100,000 Worker requests/day and 10 ms CPU per invocation; D1 includes 5 million rows read/day, 100,000 rows written/day, 500 MB per database, and 5 GB total account storage. Free Queues include 10,000 operations/day and 24-hour message retention. Queue retries, dead-letter writes, reconciliation sends, and consumer reads add operations. These limits can change; check the linked [Workers pricing/limits](https://developers.cloudflare.com/workers/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), and [Queues pricing/limits](https://developers.cloudflare.com/queues/platform/limits/) before enabling a live pilot.

If a quota is exhausted or a dependency fails, the Worker fails closed: webhook enqueue failures return `503`, Queue processing retries with bounded delay and then moves the message to the dead-letter Queue, and a scheduler page/cursor is not advanced after a failed enumeration or enqueue. The local state does not turn missing evidence green. Monitor daily usage and Queue backlog in Cloudflare; there is no project-specific quota forecasting or automatic DLQ replay. Keep the open-PR volume and webhook traffic low enough to leave headroom for retries.

## Disable and rollback

To stop new work, remove or disable the GitHub webhook. To stop scheduled scans, disable the Worker's production Cron Trigger. Pause the production Queue consumer to stop already queued work. To stop report writes immediately, revoke the App's `checks:write` permission; the observer can continue only if its read permissions remain. Deploy a reviewed previous Worker version for code rollback. Existing Check Runs remain visible but neutral and non-required. Preserve D1 long enough for diagnosis, then remove retained state according to the maintainer's retention decision.

Never use rollback to alter PR code, rerun Actions, push, merge, or change Digital-E commerce production data.
