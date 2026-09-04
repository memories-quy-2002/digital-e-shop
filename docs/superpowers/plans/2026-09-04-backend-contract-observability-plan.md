# Backend Contract and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize backend success/error metadata, add request correlation IDs and structured request/error logs, and protect critical authentication, ownership, checkout, and webhook flows with `*.spec.ts` coverage.

**Architecture:** Keep existing route payload fields and legacy `msg`/string `error` values so the current client contract remains compatible. Add canonical `success`, `code`, `details`, and `requestId` metadata through shared response builders, a global request-id middleware, the existing response/logging interceptor, and the global exception filter.

**Tech Stack:** NestJS, Express, TypeScript, Vitest, RxJS, Pino.

## Global Constraints

- Use pnpm-compatible project scripts and existing server dependencies only.
- Preserve CSRF, cookie, role, ownership, Stripe raw-body handling, and existing top-level response fields.
- Do not touch unrelated client or seed changes in the dirty worktree.

---

### Task 1: Define the response/error contract with tests first

**Files:**
- Create: `server/src/shared/http/api-response.ts`
- Create: `server/src/shared/http/api-response.spec.ts`
- Modify: `server/src/filters/__tests__/all-exceptions.filter.test.ts`

- [x] Write tests for canonical success metadata and canonical errors while retaining `msg`, string `error`, and legacy details.
- [x] Run the focused specs and confirm the new contract fails before implementation.
- [x] Implement `buildSuccessResponse` and `buildErrorResponse` with stable status codes and error codes.
- [x] Run the focused specs again and confirm they pass.

### Task 2: Add request IDs and structured observability

**Files:**
- Create: `server/src/middleware/request-id.middleware.ts`
- Create: `server/src/middleware/request-id.spec.ts`
- Create: `server/src/interceptors/request-logger.interceptor.spec.ts`
- Modify: `server/src/interceptors/request-logger.interceptor.ts`
- Modify: `server/src/filters/all-exceptions.filter.ts`
- Modify: `server/src/main.ts`
- Modify: `server/src/shared/interfaces/express.d.ts`

- [x] Write failing tests for valid/invalid incoming request IDs, response headers, success metadata, and structured request logging.
- [x] Implement request ID assignment, `X-Request-Id` propagation, production logging, and filter logging with request context.
- [x] Run the focused specs and then the complete unit suite.

### Task 3: Cover important backend flows with `*.spec.ts`

**Files:**
- Create: `server/src/flows/authz-flow.spec.ts`
- Create: `server/src/flows/checkout-flow.spec.ts`
- Create: `server/src/flows/stripe-webhook-flow.spec.ts`
- Modify: `server/vitest.config.ts`
- Modify: `server/vitest.integration.config.ts`

- [x] Add tests for customer/admin ownership boundaries, checkout validation and discount recomputation, and Stripe raw-body/signature behavior.
- [x] Include both `.test.ts` and `.spec.ts` in Vitest discovery.
- [x] Run unit, integration (when MySQL is available), typecheck, build, and lint checks.

### Task 4: Apply the contract to manual responses and legacy middleware

**Files:**
- Modify: `server/src/auth/auth.controller.ts`
- Modify: `server/src/stripe/stripeWebhook.controller.ts`
- Modify: `server/src/core/middlewares/errorHandler.ts`

- [x] Add canonical success/error metadata to manual auth and webhook responses without removing existing fields.
- [x] Reuse the shared error builder in the legacy error handler.
- [x] Run focused auth/webhook/filter specs and the full backend checks.
