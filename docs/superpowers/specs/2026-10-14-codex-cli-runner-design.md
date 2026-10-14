# Codex CLI runner provider design

**Date:** 2026-10-14  
**Status:** Draft for maintainer review  
**Scope:** Replace the Issue task runner's OpenAI API-key provider assumption with a host-managed Codex CLI `app-server` provider that uses the operator's separately authenticated ChatGPT account.

## Goal

Allow the trusted self-hosted runner to request GPT-6-Luna responses through the operator's Codex CLI / ChatGPT plan login, without requiring an OpenAI API key or putting credentials in the task container. Preserve the existing bounded task lifecycle and fail-closed controls.

This is a provider integration only. It does not enable autonomous task intake, auto-merge, GitHub writes, deployment, or a live pilot. The canonical autonomy policy remains disabled until a separate policy review and a fresh run.

## Current system and constraint

The task pipeline already injects a host-owned `invokeModelCall` broker into the Docker adapter. The task container communicates through a bounded model-call protocol, and Docker runs with networking disabled and without GitHub credentials. The current policy and validators call the provider `openai`, while the runner documentation says a live pilot requires a host-managed OpenAI API key. No production model backend is currently wired.

The required boundary is that the Codex CLI process and its ChatGPT OAuth session stay on the trusted runner host, under the dedicated runner OS identity. The issue-task container must never receive the OAuth token, Codex home directory, API key, or a general-purpose Codex shell/tool capability.

## Proposed design

Add a host-side Codex app-server broker that implements the existing model-call contract. It launches the supported Codex CLI app-server in stdio mode under the dedicated runner identity, authenticates through that identity's ChatGPT plan login, and maps the existing fixed model choice to the app-server's supported GPT-6-Luna model identifier. The broker sends only bounded task context and receives structured model output. It does not run `codex exec` inside the task container.

The app-server is an inference endpoint only. Configure each request with no shell, local file, MCP, or other agent tools; no repo workspace access; no GitHub credentials; and no provider/model fallback. The host broker independently checks the requested provider and model against canonical policy, reserves the existing per-task model-call budget before each request, bounds request/response sizes and time, and cancels or terminates the app-server request/process when its task deadline or cancellation fires. A missing CLI, unsupported model, unauthenticated/expired login, protocol mismatch, exhausted budget, or uncertain process state fails closed and escalates or yields for operator repair; it never silently switches to the API.

The task container remains `--network none`, credentialless, read-only for source, and limited to the existing model-call stdio bridge. Model output remains untrusted input subject to existing exact-path, risk, patch, verification, and delivery controls. The broker must not expose host paths, credentials, raw account metadata, or unrestricted command output in model context, task state, packets, or logs.

## Authentication and usage

Authentication is performed once by an operator interactively signing in to Codex CLI for the dedicated runner OS identity. The resulting OAuth credentials stay in the host's protected Codex credential store with filesystem access restricted to that identity. They are not checked into the repository, copied into environment variables or container mounts, serialized into LoopState/TaskRecord, or included in logs. The runner reports only a bounded authenticated/unavailable state. Revoked, missing, expired, or unreadable credentials prevent model calls until the operator re-authenticates.

This provider uses the ChatGPT plan's Codex allowance, not OpenAI API credits. Keep the canonical maximum model-call budget and the existing wall-clock and concurrency limits. Record usage only when the app-server returns validated usage data. If a token limit is configured and the provider cannot supply trustworthy token usage, fail closed as required by the Loop Engineering contract; do not estimate or fabricate usage. If usage is absent while no token limit is configured, preserve `tokenUsed: null` and rely on the bounded call-count, wall-clock, and delivery budgets.

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
- Changing eligible task paths, risk classes, human approval policy, model-call budgets, or the single-task concurrency limit.

## Acceptance criteria

1. Production pipeline can use the host Codex app-server broker through the existing injected model-call interface; unit tests can substitute a fake broker without launching Codex or making network/model requests.
2. Canonical policy and every boundary validator accept only provider `codex-app-server` with model `GPT-6-Luna`; stale `openai` or unknown provider/model values fail closed.
3. The broker runs under the dedicated host identity, uses that identity's Codex ChatGPT login, and never mounts or forwards credential material to the task container or persists it in loop state, packets, logs, or generated artifacts.
4. App-server requests have no tools or host/repository access and use only bounded task context. The task Docker container remains network-disabled and credentialless.
5. Model-call, wall-clock, response-size, concurrency, cancellation, and failure budgets are enforced before and during calls. There is no provider or model fallback.
6. Usage accounting stores only validated provider-reported usage; a configured token cap with unknown usage blocks the call/task rather than bypassing the cap.
7. Provider-specific tests cover authenticated success, missing/expired auth, malformed/protocol-incompatible response, model mismatch, budget exhaustion, timeout/cancellation, ambiguous outcomes, and unavailable usage under configured and unconfigured token caps.
8. Maintained runner/operator documentation explains Codex CLI sign-in under the dedicated OS identity, protected credential storage, ChatGPT plan allowance usage, required host setup, and fail-closed recovery. It no longer instructs operators to create an API key for this provider.
9. Policy eligibility remains disabled and unchanged, and verification uses only fake app-server/model adapters; no real model request, GitHub write, push, deployment, or merge occurs.

## Verification approach

Use deterministic unit tests with a fake app-server transport/process and fake usage payloads. Assert the Docker adapter still passes only the model-call protocol and starts with networking disabled. Run the focused loop task/runner tests, then the repository's applicable full server/script checks and static checks. Inspect the final diff for credentials, accidental policy enablement, provider fallback, widened container access, and changes to protected task eligibility.

## Open implementation detail

The exact app-server protocol revision and model identifier must be verified against the installed Codex CLI at implementation time. If the installed CLI cannot expose GPT-6-Luna through app-server, stop and report the incompatibility; do not use another model or API billing as a fallback. If token usage is not reliably available, the host must preserve the configured-token-limit fail-closed rule.
