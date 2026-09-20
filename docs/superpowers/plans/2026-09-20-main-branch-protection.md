# Main Branch Protection Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to apply the repository settings after the after-sales PR exists. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `main` so production changes require a reviewed pull request and successful CI/security checks, while retaining the existing protected production migration environment.

**Architecture:** Read the current repository, branch, check-run, and protection state before mutating settings. Apply one complete GitHub REST branch-protection update only after the after-sales PR exposes the exact check names, then read the resulting protection document and compare every required setting.

**Tech Stack:** GitHub REST API, GitHub Actions, `gh api` or the connected GitHub integration, repository settings.

**Spec:** `docs/superpowers/specs/2026-09-20-after-sales-workflow-design.md`

## Global Constraints

- Never push directly to `main`.
- Do not enable a required status-check context until its exact name is confirmed from a current PR check run.
- Do not silently allow force pushes or branch deletion.
- Keep production database migration behind the existing `production` Environment approval.
- A required external approval may make self-merge impossible for a single-owner repository; report that condition instead of weakening the rule silently.

## Review Focus

- Required contexts must match actual CI/security check names; verify against the current PR, not a guessed workflow job name.
- `enforce_admins` and one required review may block the repository owner; inspect collaborators and report the operational effect.
- Existing production migration must remain a job dependency and Environment gate; verify `.github/workflows/ci.yml` before changing rules.
- The final GET response must show force pushes/deletions disabled and linear history/conversation resolution enabled.
- A failed protection mutation must not be reported as applied; re-read the API response and repository state.

---

### Task 1: Inspect current protection and exact checks

**Files:**
- Read: `.github/workflows/ci.yml`
- Read: `.github/workflows/security.yml`
- Read: `docs/ci-cd.md`
- External read: GitHub repository metadata, branch protection, current PR checks

- [ ] **Step 1: Read current branch and repository state**

  Confirm repository `memories-quy-2002/digital-e-shop`, default branch `main`, current feature PR head, owner/admin permissions, and whether `main` is already protected.

- [ ] **Step 2: Read current PR check-run names**

  Run: `$sha = git rev-parse HEAD; gh api "repos/memories-quy-2002/digital-e-shop/commits/$sha/check-runs" --jq '.check_runs[].name'`

  Record exact names for CI client/server, dependency review, Vercel checks if intentionally required, and active CodeQL checks. Do not substitute workflow names for check-run names.

- [ ] **Step 3: Decide reviewer viability**

  Check the authenticated GitHub login and collaborator permissions. If no second reviewer exists, record that a one-review rule will block owner-only merges until a collaborator is added.

### Task 2: Apply protection to `main`

**Files:**
- External mutation: GitHub branch protection for `main`

- [ ] **Step 1: Prepare the exact JSON payload**

  Use the exact check names captured in Task 1 and this policy:

  Build the payload from the captured names rather than guessing them:

  ```powershell
  $requiredContexts = @(
    # Copy every exact CI client/server, dependency-review, and active CodeQL check-run name printed in Task 1.
  )
  if ($requiredContexts.Count -lt 4) { throw "Expected CI, dependency-review, and CodeQL check contexts before protecting main." }
  $protection = @{
    required_status_checks = @{ strict = $true; contexts = $requiredContexts }
    enforce_admins = $true
    required_pull_request_reviews = @{
      dismiss_stale_reviews = $true
      require_code_owner_reviews = $false
      required_approving_review_count = 1
      require_last_push_approval = $true
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    required_conversation_resolution = $true
    block_creations = $false
    lock_branch = $false
    allow_fork_syncing = $true
  }
  $protectionJson = $protection | ConvertTo-Json -Depth 8
  $protectionJson | gh api --method PUT repos/memories-quy-2002/digital-e-shop/branches/main/protection --input -
  ```

- [ ] **Step 2: Apply the update**

  Run with the authenticated GitHub connection:

  ```powershell
  gh api --method PUT repos/memories-quy-2002/digital-e-shop/branches/main/protection --input protection.json
  ```

  The equivalent connected GitHub REST operation is `PUT /repos/memories-quy-2002/digital-e-shop/branches/main/protection`. Do not use a force ref update or change branch contents.

- [ ] **Step 3: Read the resulting protection response**

  Run:

  ```powershell
  gh api repos/memories-quy-2002/digital-e-shop/branches/main/protection
  ```

  Expected: required reviews/status checks, strict status, linear history, conversation resolution, disabled force pushes/deletions, and admin enforcement match the payload.

### Task 3: Verify operational behavior and report the gate

**Files:**
- Read: `.github/workflows/ci.yml`
- Read: GitHub PR and branch protection response

- [ ] **Step 1: Confirm the after-sales PR is still mergeable only after checks/review**

  Read PR status and verify the required contexts are present. A pending or missing check is not a success.

- [ ] **Step 2: Confirm production migration remains protected**

  Verify `production-migrate` still needs `client` and `server`, uses Environment `production`, and does not run on pull requests.

- [ ] **Step 3: Record the final result**

  Report the branch URL, exact required contexts, whether an independent reviewer is available, and any remaining manual action. Do not claim the branch is protected unless the final GET response proves it.
