# Dependabot pnpm Compatibility Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dependabot updates work with the repository's pnpm release-age policy by upgrading the pinned pnpm version to the first compatible pnpm 12 patch release, without weakening dependency freshness controls.

**Architecture:** Keep the existing independent `client/` and `server/` pnpm packages. Update active package-manager pins, regenerate each package-local lockfile with the target pnpm version, and keep Dependabot's existing pnpm update strategy and `minimumReleaseAge` policy unchanged.

**Tech Stack:** pnpm 12.4.2, Node.js 24.20.0, React/Vite client, NestJS server, GitHub Actions, Dependabot.

## Global Constraints

- Preserve the independent client/server package boundaries and package-local lockfiles.
- Preserve `minimumReleaseAge` and `minimumReleaseAgeExclude`; do not disable the cooldown or bypass Dependabot's safety settings.
- Do not change database schemas, migrations, authentication, or runtime API contracts.
- Do not rewrite historical changelog or completed plan entries merely because they mention the previous pnpm pin.
- Do not commit or push as part of this implementation unless explicitly requested.

## Tasks

- [x] Update active pnpm pins in package manifests, server scripts, CI workflows, and the startup regression test.
- [x] Regenerate `client/pnpm-lock.yaml` and `server/pnpm-lock.yaml` with pnpm 12.4.2.
- [x] Update maintained setup/operations documentation and append the Wiki maintenance entry.
- [x] Verify the new pnpm version, lockfile reproducibility, changed-package checks, and the final diff for accidental scope creep.

## Verification

- `corepack pnpm@12.4.2 --version`
- Frozen lockfile installs for `client/` and `server/` with scripts disabled.
- Client typecheck, build, and tests.
- Server typecheck, build, and tests.
- `git diff --check` and an active-pin search confirming no stale operational `12.3.4` references remain.
