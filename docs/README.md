# Documentation

This directory contains maintained guides for Digital-E development, API work, verification, CI/CD, and lightweight product-engineering planning. Use the root [README](../README.md) for a first setup, and use the [Wiki](../Wiki/index.md) for durable architecture and business-rule knowledge.

## Guides

- [Architecture](./ARCHITECTURE.md): client, server, request flow, persistence, and security boundaries
- [API guide](./API.md): route groups, response conventions, authentication, and safe performance surfaces
- [Development guide](./DEVELOPMENT.md): package-local setup, environment files, database workflow, and code boundaries
- [Testing guide](./TESTING.md): client and server checks, integration tests, and read-only k6 scenarios
- [CI/CD guide](./ci-cd.md): GitHub Actions, Vercel boundaries, migration gates, and release safety
- [Thunder Client import](./thunder-client/README.md): API collection setup for local sessions

## Planning and process

- [Codex orchestration](./CODEX_ORCHESTRATION.md): bounded delegation and verification roles
- [BMAD workflow](./bmad/README.md): lightweight product and engineering planning
- [AI task prompts](./ai-prompts/): reusable prompts for features, fixes, refactors, tests, and Wiki ingestion
- [Superpowers plans and specs](./superpowers/): historical design and implementation records

Completed plans and specs remain historical records. Update maintained guides and Wiki pages when the implementation changes instead of rewriting past decisions.
