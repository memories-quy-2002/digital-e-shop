# Codex CLI runner provider design

**Date:** 2026-10-14  
**Status:** Draft for maintainer review  
**Scope:** Replace the Issue task runner's OpenAI API-key provider assumption with a host-managed Codex CLI `app-server` provider using the operator's ChatGPT plan, run by a GitHub Actions self-hosted runner installed as a service on the operator's machine.

## Goal

Allow a GitHub Actions self-hosted runner on the operator's machine to start automatically when that machine starts, then request GPT-6-Luna responses through the operator's ChatGPT plan without requiring an OpenAI API key or putting credentials in the task container. When the machine is off or asleep, it cannot process work; eligible GitHub jobs remain queued and can run after it reconnects, subject to GitHub's queue timeout. Preserve the existing bounded task lifecycle and fail-closed controls.

This is a provider integration only. It does not enable autonomous task intake, auto-merge, GitHub writes, deployment, or a live pilot. The canonical autonomy policy remains disabled until a separate policy review and a fresh run.

## Current system and constraint

The task pipeline already injects a host-owned `invokeModelCall` broker into the Docker adapter. The task container communicates through a bounded model-call protocol, and Docker runs with networking disabled and without GitHub credentials. The current policy and validators call the provider `openai`, while the runner documentation says a live pilot requires a host-managed OpenAI API key. No production model backend is currently wired.

The required boundary is that the GitHub Actions self-hosted runner service, model broker, and ChatGPT plan credentials stay on the operator's trusted host, under a dedicated local OS identity. Configure the Actions runner as a machine-start service so it reconnects when the machine boots. The issue-task container must never receive the OAuth token, Codex home/credential directory, API key, or a general-purpose Codex shell/tool capability.

## Proposed design

Install the GitHub Actions self-hosted runner application as an auto-start service on the operator's host. Keep the existing durable TaskRecord/queue as the source of truth; a narrowly scoped trusted workflow on the self-hosted runner claims a queued task through the existing authenticated runtime contract and validates its task identity, lease, policy revision, and deadline before execution. The exact queue-to-workflow trigger must be selected during implementation without weakening current authentication or adding broad GitHub write permissions. Add a host-side Codex app-server broker that implements the existing model-call contract. It launches the supported Codex CLI app-server in stdio mode under the dedicated runner identity and receives a ChatGPT-plan OAuth access token from the host's protected credential store. The broker maps the existing fixed model choice to the app-server's supported GPT-6-Luna model identifier, sends only bounded task context, and receives structured model output. It does not run `codex exec` inside the task container.

Use the supported Sign in with ChatGPT OAuth flow for a local app to obtain the access and refresh tokens authorized for ChatGPT plan usage; do not assume that app-server can reuse the interactive `codex login` credential file. First verify that the current local/private app integration and selected account are eligible for this flow. Persist the client registration and stable host ID, validate the granted plan-usage scope, store credentials in host-protected storage, refresh them on the host, and fail closed when consent, scope, refresh, or inference authorization is unavailable. The operator may authorize the same ChatGPT account used for Codex. Do not transfer a laptop credential file to a different VM or host without following the host-specific registration/credential procedure. If plan-usage authorization is unavailable, stop the provider integration for review; do not fall back to API billing.

The app-server is an inference endpoint only. Configure each request with no shell, local file, MCP, or other agent tools; no repo workspace access; no GitHub credentials; and no provider/model fallback. The host broker independently checks the requested provider and model against canonical policy, reserves the existing per-task model-call budget before each request, bounds request/response sizes and time, and cancels or terminates the app-server request/process when its task deadline or cancellation fires. A missing CLI, unsupported model, unauthenticated/expired login, protocol mismatch, exhausted budget, or uncertain process state fails closed and escalates or yields for operator repair; it never silently switches to the API.

The task container remains `--network none`, credentialless, read-only for source, and limited to the existing model-call stdio bridge. The runner host itself must have outbound connectivity to GitHub and the OpenAI Responses endpoint. Model output remains untrusted input subject to existing exact-path, risk, patch, verification, and delivery controls. The broker must not expose host paths, credentials, raw account metadata, or unrestricted command output in model context, task state, packets, or logs.

When the host is offline or asleep, GitHub cannot assign it jobs. Jobs may remain queued until the host returns, but GitHub documents a 24-hour queue timeout for self-hosted runner jobs; after that, the job fails and must be reconciled through the task lifecycle. The service must not bypass TaskRecord deadlines, lease checks, or stale-task reconciliation when it reconnects. Configure the runner for this trusted repository/workflow only and do not route arbitrary fork/PR code to the persistent credential-bearing host. Where the operator's machine is Windows, validate Docker engine availability when the runner service starts; a Linux host or isolated Linux VM is preferred if the required Docker isolation flags are not supported by the Windows Docker setup.

## Authentication and usage

Authentication is performed by the operator authorizing the local/open-source app with their ChatGPT account and explicitly granting ChatGPT plan usage. The host stores the app's OAuth access/refresh credentials and client registration in protected storage accessible only to the runner identity. The runner refreshes tokens on the host. Credentials are not checked into the repository, persisted in workflow artifacts/cache, copied into task-container mounts, serialized into LoopState/TaskRecord, or included in logs. The runner reports only a bounded authenticated/unavailable state. Revoked, missing, expired, unrefreshable, or insufficiently scoped credentials prevent model calls until the operator completes authorization again.

This provider uses the ChatGPT plan's eligible usage/credits, not OpenAI API billing. For Plus, use across participating apps shares the plan's agentic allowance; it does not create a separate per-runner allowance. Keep the canonical maximum model-call budget and the existing wall-clock and concurrency limits. Record usage only when the app-server returns validated usage data. If a token limit is configured and the provider cannot supply trustworthy token usage, fail closed as required by the Loop Engineering contract; do not estimate or fabricate usage. If usage is absent while no token limit is configured, preserve `tokenUsed: null` and rely on the bounded call-count, wall-clock, and delivery budgets.

The integration is for this operator's self-hosted runner, not a multi-tenant credential service. Any future third-party hosted/commercial use requires a separate review of account authorization, terms, and credential isolation.

## Configuration and compatibility

Replace the misleading runner provider value `openai` with one explicit value, `codex-app-server`, in the canonical policy contract, policy loader, ingress/runtime validation, model-broker selection, tests, and maintained operational documentation. Continue to pin the only permitted model as `GPT-6-Luna`; reject unknown values and all fallback behavior. Do not add an API-key provider in this change.

The policy stays `enabled: false`, `autoMergeEnabled: false`, with its current actors, paths, risks, capabilities, and budgets. Do not modify eligibility or approvals as part of this provider migration. The historical implementation plan may retain its accurate statement about the old design; add a dated migration note or update maintained docs so operators no longer follow obsolete API-key setup instructions.

## Failure handling and observability

- App-server startup and authentication checks are host-only and expose no secrets.
- Protocol errors, malformed responses, unsupported usage fields, timeouts, cancellation failures, and unexpected process exits are classified into bounded reason codes.
- Any ambiguous request outcome is treated as consumed budget; it is never retried without a fresh budget reservation and idempotency-safe request handling.
- Keep at most one active task/model session, consistent with the existing concurrency policy.
- Logs contain provider name, model, task ID, bounded reason code, duration, and validated usage totals when available. They exclude prompts, response bodies, OAuth data, cookies, account identifiers, and environment dumps.
- Health/status checks report only whether the CLI is present, protocol-compatible, and authenticated; they do not print or return token material.

## Out of scope

- Enabling `.agent/policy/autonomy.yml` or auto-merge.
- Provisioning Cloudflare Queue/D1 or the private runner gateway, deploying infrastructure, or running a live Issue task.
- GitHub App installation/permission changes, GitHub writes, push, PR creation, merge, or production actions.
- Running Codex CLI in the Docker task container or granting the model shell, filesystem, MCP, network, or GitHub capabilities.
- Supporting API-key authentication or automatically falling back to API billing.
- Running the GitHub runner on GitHub-hosted ephemeral machines, a cloud VM, or a multi-tenant credential service in this first iteration.
- Changing eligible task paths, risk classes, human approval policy, model-call budgets, or the single-task concurrency limit.

## Acceptance criteria

1. Production pipeline can use the host Codex app-server broker through the existing injected model-call interface; unit tests can substitute a fake broker without launching Codex or making network/model requests.
2. Canonical policy and every boundary validator accept only provider `codex-app-server` with model `GPT-6-Luna`; stale `openai` or unknown provider/model values fail closed.
3. The GitHub Actions self-hosted runner starts as a host service after machine boot, reconnects to GitHub when online, and launches only the bounded trusted task workflow. The workflow claims work from the existing durable task queue through an authenticated, lease-checked contract. A queued job can wait for the machine to return, but the 24-hour GitHub queue timeout and Loop task deadline are explicit and reconciled.
4. Before implementation proceeds, the operator's local/private app and selected ChatGPT account are confirmed eligible for Sign in with ChatGPT plan usage. The host refreshes protected OAuth credentials; the implementation does not assume the app-server can read credentials from `codex login`, and it stops if eligibility or granted scope is unavailable.
5. The broker runs under the dedicated host identity and never mounts or forwards credential material to the task container or persists it in loop state, packets, logs, caches, workflow artifacts, or generated artifacts.
6. App-server requests have no tools or host/repository access and use only bounded task context. The task Docker container remains network-disabled and credentialless.
7. Model-call, wall-clock, response-size, concurrency, cancellation, and failure budgets are enforced before and during calls. There is no provider or model fallback.
8. Usage accounting stores only validated provider-reported usage; a configured token cap with unknown usage blocks the call/task rather than bypassing the cap.
9. Provider-specific tests cover OAuth consent/auth success, missing/expired/unrefreshable credentials, malformed/protocol-incompatible response, model mismatch, budget exhaustion, timeout/cancellation, ambiguous outcomes, and unavailable usage under configured and unconfigured token caps.
10. Maintained runner/operator documentation explains installing the self-hosted runner as an auto-start service, trusted workflow restrictions, ChatGPT plan OAuth authorization, protected credential storage, queue/deadline behavior while the machine is offline, Docker engine startup, and fail-closed recovery. It no longer instructs operators to create an API key for this provider.
11. Policy eligibility remains disabled and unchanged, and verification uses only fake app-server/model adapters; no real model request, GitHub write, push, deployment, or merge occurs.

## Verification approach

Use deterministic unit tests with a fake app-server transport/process and fake usage payloads. Assert the Docker adapter still passes only the model-call protocol and starts with networking disabled. Run the focused loop task/runner tests, then the repository's applicable full server/script checks and static checks. Inspect the final diff for credentials, accidental policy enablement, provider fallback, widened container access, and changes to protected task eligibility.

## Open implementation detail

The exact app-server protocol revision and model identifier must be verified against the installed Codex CLI at implementation time. If the installed CLI cannot expose GPT-6-Luna through app-server, stop and report the incompatibility; do not use another model or API billing as a fallback. Confirm current OpenAI Sign in with ChatGPT eligibility and the supported local-app registration path before implementing auth. If token usage is not reliably available, the host must preserve the configured-token-limit fail-closed rule. Confirm the supported Docker engine/service startup on the operator's chosen host OS before selecting Windows versus Linux for the self-hosted runner.
