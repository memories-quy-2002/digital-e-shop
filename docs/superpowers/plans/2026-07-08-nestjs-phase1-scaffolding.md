# NestJS Migration Phase 1: Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the real NestJS application skeleton inside `server/` — `AppModule`, a `ConfigModule` that wraps the existing `env.config.ts` values, a global exception filter that preserves the current error response shapes, a request-logging interceptor matching current behavior, and a health-check route — without wiring in any feature module yet. This is the foundation every later migration phase (auth, then feature modules) builds on.

**Architecture:** A new Nest bootstrap lives alongside the existing Express app during this phase — it does NOT replace `server/src/app.ts` or `server/api/index.ts` yet. The Nest skeleton is built and verified standing alone (own local dev entrypoint), proving the scaffolding works, before any cutover happens. Cutover (swapping the real entrypoint) is deliberately out of scope for this phase — it happens only after every module is migrated, per the spec's Section "Migration order" step 7.

**Tech Stack:** NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`, `@nestjs/config`), existing `pino` logger, existing `AppError` class, TypeScript with `experimentalDecorators`/`emitDecoratorMetadata` (new requirement for this codebase — the existing `server/tsconfig.json` does not set these).

## Global Constraints

- Do not modify or remove `server/src/app.ts`, `server/api/index.ts`, or `server/vercel.json` in this phase — the current Express app keeps serving production traffic unchanged until final cutover (spec Section "Migration order", step 7, explicitly last).
- Preserve exact error response shapes from the existing `errorHandler` ([server/src/core/middlewares/errorHandler.ts](../../../server/src/core/middlewares/errorHandler.ts)): CSRF errors (`err.code === "EBADCSRFTOKEN"` or `err.message === MESSAGES.invalidCsrf`) return `{ error: MESSAGES.invalidCsrf }` with 403; `AppError` instances return `{ msg: err.message, ...err.details }` with `err.statusCode`; unknown errors return `{ error: MESSAGES.internalServerError }` with 500. (Per AGENTS.md: "Avoid 'cleaning up' response shapes unless the user explicitly asks for an API contract change.")
- Preserve exact request-logging behavior from [server/src/core/middlewares/requestLogger.ts](../../../server/src/core/middlewares/requestLogger.ts): only logs when `process.env.NODE_ENV !== "production"`, logs `{ method, url, statusCode, durationMs }` via the existing `pino` logger instance at request-finish time.
- Reuse the existing `env` config object from [server/src/config/env.config.ts](../../../server/src/config/env.config.ts) as the source of truth — do not duplicate env-parsing logic in a new Nest-specific config loader.
- Reuse the existing `AppError` class from [server/src/core/errors/AppError.ts](../../../server/src/core/errors/AppError.ts) unchanged — Nest's exception filter wraps it, does not replace it.
- Use pnpm only. New Nest dependencies go into `server/package.json` in this phase (unlike the throwaway spike, this is the real migration).
- New Nest source files live under `server/src/nest/` during this transitional phase (a new subdirectory, sibling to `modules/`, `core/`, `config/`) so they're clearly separated from the still-active Express code until cutover. This placement is temporary scaffolding structure, not a new permanent architecture layer — later phases will discuss whether `nest/` becomes the new root or gets flattened at cutover time.
- Local commits only for this session unless the user explicitly requests a push — this repo's owner has instructed that changes should not be committed/pushed until requested, though standard task-level local commits (no push) are the agreed working mode per the prior spike phase.

---

### Task 1: Add NestJS dependencies and enable decorator support in tsconfig

**Files:**
- Modify: `server/package.json`
- Modify: `server/tsconfig.json`

**Interfaces:**
- Produces: `experimentalDecorators: true` and `emitDecoratorMetadata: true` compiler options, required by every subsequent Nest file in this plan (`@Module`, `@Controller`, `@Injectable`, `@Catch`, etc. all need these).

- [ ] **Step 1: Add NestJS dependencies to server/package.json**

Add to the `dependencies` section (alphabetically, matching existing style):

```json
"@nestjs/common": "^11.0.0",
"@nestjs/config": "^4.0.0",
"@nestjs/core": "^11.0.0",
"@nestjs/platform-express": "^11.0.0",
"reflect-metadata": "^0.2.2",
"rxjs": "^7.8.1",
```

Read the current `server/package.json` first to place these correctly in the existing alphabetized dependency list (currently `@prisma/adapter-mariadb` through `zod`).

- [ ] **Step 2: Install dependencies**

Run:
```powershell
pnpm --filter server install
```
Expected: install succeeds, the root `pnpm-lock.yaml` (this workspace has no nested `server/pnpm-lock.yaml` — only the root-level lockfile tracks all workspace packages including `server`) updates to include the new packages.

If pnpm blocks on an unapproved build script (this repo has hit this before with `esbuild` during the earlier spike), run:
```powershell
pnpm --filter server approve-builds
```
and re-run install.

- [ ] **Step 3: Enable decorator metadata in server/tsconfig.json**

Read `server/tsconfig.json` first. Add these two options to `compilerOptions` (keep every existing option — this only adds two new ones):

```json
"experimentalDecorators": true,
"emitDecoratorMetadata": true,
```

Do not change `strict`, `noImplicitAny`, `module`, or `moduleResolution` — those are existing project-wide settings unrelated to this task (per AGENTS.md: "Server TypeScript is less strict... preserve local style").

- [ ] **Step 4: Verify typecheck still passes with no Nest code yet**

Run:
```powershell
pnpm --filter server typecheck
```
Expected: passes with no errors (decorator options alone don't break existing non-decorator code).

- [ ] **Step 5: Commit**

```bash
git add server/package.json pnpm-lock.yaml server/tsconfig.json
git commit -m "chore(server): add NestJS dependencies and enable decorator metadata"
```

---

### Task 2: Build the Nest ConfigModule wrapping existing env values

**Files:**
- Create: `server/src/nest/config/nest-config.module.ts`
- Create: `server/src/nest/config/nest-config.service.ts`
- Test: `server/src/nest/config/__tests__/nest-config.service.test.ts`
- Modify: `server/vitest.setup.ts`

**Interfaces:**
- Consumes: `env` object and `isProduction` from `server/src/config/env.config.ts` (existing, unchanged).
- Produces: `NestConfigService` class with a `get<K extends keyof typeof env>(key: K): typeof env[K]` method and an `isProduction: boolean` getter, injectable via Nest DI, consumed by Task 3's exception filter and Task 4's health controller.

- [ ] **Step 0: Register reflect-metadata in the Vitest setup file (required before any Nest DI test can run)**

Nest's dependency injection (used by `@nestjs/testing`'s `Test.createTestingModule`, which every test in this plan from here on depends on) requires `reflect-metadata` to be imported once, globally, before any `@Injectable()`/`@Module()`-decorated class is loaded. The project's existing `server/vitest.setup.ts` only registers tsx's CJS hook — it does not import `reflect-metadata`. Without this step, Task 2's first test (and every later Nest-related test) will fail with a DI resolution error unrelated to the code under test.

Read `server/vitest.setup.ts` first, then add the import at the top:

```typescript
// Nest's DI relies on reflect-metadata being registered globally before any
// decorated class loads — required for @nestjs/testing's Test.createTestingModule.
import "reflect-metadata";
import "tsx/cjs";
```

Path: `server/vitest.setup.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { NestConfigModule } from "../nest-config.module";
import { NestConfigService } from "../nest-config.service";

describe("NestConfigService", () => {
    it("exposes values from the existing env config object", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [NestConfigModule],
        }).compile();

        const service = moduleRef.get(NestConfigService);

        expect(service.get("nodeEnv")).toBe(process.env.NODE_ENV || "development");
        expect(service.get("port")).toBeTypeOf("number");
    });

    it("exposes isProduction matching the existing env module's flag", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [NestConfigModule],
        }).compile();

        const service = moduleRef.get(NestConfigService);

        expect(service.isProduction).toBe(process.env.NODE_ENV === "production");
    });
});
```

Path: `server/src/nest/config/__tests__/nest-config.service.test.ts`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- nest-config.service.test.ts`
Expected: FAIL — `nest-config.module` and `nest-config.service` do not exist yet.

- [ ] **Step 3: Write the NestConfigService**

```typescript
import { Injectable } from "@nestjs/common";
import { env, isProduction } from "#src/config/env.config";

@Injectable()
export class NestConfigService {
    get<K extends keyof typeof env>(key: K): (typeof env)[K] {
        return env[key];
    }

    get isProduction(): boolean {
        return isProduction;
    }
}
```

Path: `server/src/nest/config/nest-config.service.ts`

- [ ] **Step 4: Write the NestConfigModule**

```typescript
import { Global, Module } from "@nestjs/common";
import { NestConfigService } from "./nest-config.service";

@Global()
@Module({
    providers: [NestConfigService],
    exports: [NestConfigService],
})
export class NestConfigModule {}
```

Path: `server/src/nest/config/nest-config.module.ts`

`@Global()` makes `NestConfigService` injectable anywhere without every feature module re-importing `NestConfigModule` — matches how `env` is currently imported directly anywhere in the codebase without ceremony.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter server test -- nest-config.service.test.ts`
Expected: PASS, 2/2 tests.

- [ ] **Step 6: Commit**

```bash
git add server/src/nest/config/
git commit -m "feat(server): add Nest ConfigModule wrapping existing env config"
```

---

### Task 3: Build the global exception filter preserving existing error response shapes

**Files:**
- Create: `server/src/nest/filters/all-exceptions.filter.ts`
- Test: `server/src/nest/filters/__tests__/all-exceptions.filter.test.ts`

**Interfaces:**
- Consumes: `AppError` from `server/src/core/errors/AppError.ts`, `HTTP_STATUS` from `server/src/shared/constants/httpStatus.ts`, `MESSAGES` from `server/src/shared/constants/messages.ts`, `logger` from `server/src/shared/utils/logger.ts` — all existing, unchanged.
- Produces: `AllExceptionsFilter` class implementing Nest's `ExceptionFilter`, registered as a global filter in Task 5's `main.ts`. Consumed by every future migrated route (all subsequent phases rely on this producing identical response shapes to the current `errorHandler`).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import type { ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "../all-exceptions.filter";
import { AppError } from "#src/core/errors/AppError";
import { MESSAGES } from "#src/shared/constants/messages";

function buildHost(): { host: ArgumentsHost; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
        switchToHttp: () => ({
            getResponse: () => ({ status }),
            getRequest: () => ({}),
        }),
    } as unknown as ArgumentsHost;
    return { host, json, status };
}

describe("AllExceptionsFilter", () => {
    it("returns 403 with invalidCsrf error shape for CSRF errors", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();

        filter.catch({ code: "EBADCSRFTOKEN" } as never, host);

        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: MESSAGES.invalidCsrf });
    });

    it("returns AppError statusCode with msg + details shape", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();
        const err = new AppError("Not found", 404, "NOT_FOUND", { resource: "product" });

        filter.catch(err, host);

        expect(status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith({ msg: "Not found", resource: "product" });
    });

    it("returns 500 with internalServerError shape for unknown errors", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();

        filter.catch(new Error("boom"), host);

        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({ error: MESSAGES.internalServerError });
    });
});
```

Path: `server/src/nest/filters/__tests__/all-exceptions.filter.test.ts`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- all-exceptions.filter.test.ts`
Expected: FAIL — `all-exceptions.filter` does not exist yet.

- [ ] **Step 3: Write the filter**

```typescript
import { Catch, HttpStatus } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "#src/core/errors/AppError";
import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { MESSAGES } from "#src/shared/constants/messages";
import type { DbError } from "#src/shared/interfaces/database";
import { logger } from "#src/shared/utils/logger";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: DbError | AppError | Error, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const err = exception as DbError | AppError;

        if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
            res.status(HTTP_STATUS.FORBIDDEN).json({ error: MESSAGES.invalidCsrf });
            return;
        }

        if (err instanceof AppError) {
            res.status(err.statusCode).json({
                msg: err.message,
                ...(err.details || {}),
            });
            return;
        }

        logger.error((err as Error)?.stack || err);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR || HttpStatus.INTERNAL_SERVER_ERROR).json({
            error: MESSAGES.internalServerError,
        });
    }
}
```

Path: `server/src/nest/filters/all-exceptions.filter.ts`

This is a line-for-line port of the existing `errorHandler` — same branching order, same response shapes, only the Express `(req, res, next)` signature is replaced with Nest's `ArgumentsHost` access pattern.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- all-exceptions.filter.test.ts`
Expected: PASS, 3/3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/nest/filters/
git commit -m "feat(server): add Nest global exception filter matching existing error shapes"
```

---

### Task 4: Build the request-logging interceptor and health controller

**Files:**
- Create: `server/src/nest/interceptors/request-logger.interceptor.ts`
- Create: `server/src/nest/health/health.controller.ts`
- Create: `server/src/nest/health/health.module.ts`
- Test: `server/src/nest/health/__tests__/health.controller.test.ts`

**Interfaces:**
- Consumes: `logger` from `server/src/shared/utils/logger.ts` (existing).
- Produces: `RequestLoggerInterceptor` (registered globally in Task 5) and `HealthController` with `GET /health` returning `{ status: "ok", timestamp: string }` — same shape as the existing `/api/health` route in `server/src/app.ts:146-151`, exposed at bare `/health` in this phase since global prefix wiring is Task 5's job.

- [ ] **Step 1: Write the failing test for the health controller**

```typescript
import { describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { HealthModule } from "../health.module";
import { HealthController } from "../health.controller";

describe("HealthController", () => {
    it("returns status ok with a timestamp", async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [HealthModule],
        }).compile();

        const controller = moduleRef.get(HealthController);
        const result = controller.getHealth();

        expect(result.status).toBe("ok");
        expect(typeof result.timestamp).toBe("string");
        expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    });
});
```

Path: `server/src/nest/health/__tests__/health.controller.test.ts`

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter server test -- health.controller.test.ts`
Expected: FAIL — `health.module` and `health.controller` do not exist yet.

- [ ] **Step 3: Write the health controller and module**

```typescript
import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
    getHealth(): { status: string; timestamp: string } {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
        };
    }

    @Get()
    handleGet(): { status: string; timestamp: string } {
        return this.getHealth();
    }
}
```

Path: `server/src/nest/health/health.controller.ts`

```typescript
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
    controllers: [HealthController],
})
export class HealthModule {}
```

Path: `server/src/nest/health/health.module.ts`

Note: `getHealth()` is a plain method (not decorated) so the unit test can call it directly without spinning up HTTP; `handleGet()` is the actual `@Get()` route handler that delegates to it. This mirrors how the existing Express health route is a simple inline handler — no service layer needed for a single static response.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter server test -- health.controller.test.ts`
Expected: PASS, 1/1 test.

- [ ] **Step 5: Write the request-logger interceptor (no dedicated unit test — behavior is verified via Task 5's local boot + manual request in Step 4 of that task)**

```typescript
import { Injectable } from "@nestjs/common";
import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { logger } from "#src/shared/utils/logger";

@Injectable()
export class RequestLoggerInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        if (process.env.NODE_ENV === "production") {
            return next.handle();
        }

        const httpContext = context.switchToHttp();
        const req = httpContext.getRequest<Request>();
        const res = httpContext.getResponse<Response>();
        const startedAt = process.hrtime.bigint();

        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            logger.info(
                {
                    method: req.method,
                    url: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(1)),
                },
                "http request",
            );
        });

        return next.handle();
    }
}
```

Path: `server/src/nest/interceptors/request-logger.interceptor.ts`

This is a line-for-line port of the existing `requestLogger` middleware — same `NODE_ENV` gate, same `res.on("finish")` timing approach, same log shape and message.

- [ ] **Step 6: Commit**

```bash
git add server/src/nest/interceptors/ server/src/nest/health/
git commit -m "feat(server): add Nest request-logger interceptor and health controller"
```

---

### Task 5: Wire AppModule and a standalone local bootstrap, verify end-to-end

**Files:**
- Create: `server/src/nest/app.module.ts`
- Create: `server/src/nest/main.ts`
- Modify: `server/package.json` (add a dev script for this phase's standalone verification)

**Interfaces:**
- Consumes: `NestConfigModule` (Task 2), `AllExceptionsFilter` (Task 3), `RequestLoggerInterceptor` and `HealthModule` (Task 4).
- Produces: a bootable Nest application on a distinct local port, proving the full scaffolding chain works together. This `main.ts` is intentionally NOT the production entrypoint yet — cutover replaces `server/api/index.ts` in a later phase, once every feature module is migrated.

- [ ] **Step 1: Write the AppModule**

```typescript
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { NestConfigModule } from "./config/nest-config.module";
import { HealthModule } from "./health/health.module";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { RequestLoggerInterceptor } from "./interceptors/request-logger.interceptor";

@Module({
    imports: [NestConfigModule, HealthModule],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
    ],
})
export class AppModule {}
```

Path: `server/src/nest/app.module.ts`

- [ ] **Step 2: Write a standalone local bootstrap**

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const port = Number(process.env.NEST_SCAFFOLD_PORT || 4100);
    await app.listen(port);
    console.log(`Nest scaffolding phase listening on http://localhost:${port}`);
}

bootstrap();
```

Path: `server/src/nest/main.ts`

Uses port 4100 (distinct from the existing server's 4000) and a dedicated `NEST_SCAFFOLD_PORT` env var so it can run side-by-side with the existing Express dev server without colliding, per this phase's "stand alone, don't replace yet" architecture.

- [ ] **Step 3: Add a dev script for this phase**

In `server/package.json`, add to `scripts` (near the existing `dev`/`serve:ts` entries):

```json
"dev:nest-scaffold": "node --watch --conditions=development --import tsx ./src/nest/main.ts",
```

- [ ] **Step 4: Boot it and verify all four pieces work together**

Run:
```powershell
pnpm --filter server dev:nest-scaffold
```
Expected console output: `Nest scaffolding phase listening on http://localhost:4100` (plus Nest's own startup log lines showing `NestConfigModule`, `HealthModule`, and the `AppModule` dependency graph resolving without errors).

In a second terminal:
```powershell
curl http://localhost:4100/health
```
Expected: `{"status":"ok","timestamp":"..."}`, HTTP 200.

Then verify the exception filter is wired by triggering a deliberate 404 (no matching route):
```powershell
curl -i http://localhost:4100/does-not-exist
```
Expected: HTTP 404. (Nest's default 404 for unmatched routes goes through its own not-found handling before reaching `AllExceptionsFilter` for unhandled application errors — this confirms basic routing works; the filter's own behavior was already verified by Task 3's unit tests.)

Stop the dev server (Ctrl+C) once both checks pass.

- [ ] **Step 5: Run the full server verification suite**

Run:
```powershell
pnpm --filter server typecheck
pnpm --filter server test
pnpm --filter server lint
```
Expected: all three pass. `typecheck` confirms the new `nest/` tree and existing Express tree coexist without type conflicts (they do not share code paths). `test` runs the full suite including the new Task 2-4 unit tests alongside the existing cart/inventory Vitest suite. `lint` confirms the new files match the project's ESLint config.

- [ ] **Step 6: Commit**

```bash
git add server/src/nest/app.module.ts server/src/nest/main.ts server/package.json
git commit -m "feat(server): wire Nest AppModule and standalone bootstrap for scaffolding phase"
```

---

## Self-Review Notes

**Spec coverage:** This plan implements exactly the spec's Phase 1 ("Scaffolding: AppModule, ConfigModule wrapping existing env.config, global pipes/filters/guards shell, health check route") and nothing from Phase 2 onward (no Passport/JWT/CSRF/rate-limit — those are explicitly Phase 2's "Auth foundation," a separate future plan). "Guards shell" from the spec is intentionally not built yet in this phase, since there's no auth logic to guard until Phase 2 exists — an empty guards directory would be a placeholder with no content, which the plan format forbids. This is noted here rather than silently dropped: Phase 2's plan must add the guards.

**Placeholder scan:** No TBD/TODO — every step has complete, real code.

**Type consistency:** `NestConfigService.get<K>()` (Task 2) is not yet consumed by name in this phase's other tasks (Task 3's filter and Task 4's health controller don't need config values), which is expected — it exists so Phase 2 (auth, which needs `jwtSecret`, `csrfSecret`, etc.) can inject it immediately. Confirmed the class name `NestConfigService` and its `get`/`isProduction` members are stable across every task that mentions it (Task 2 definition, this note) — no other task references it by a different name.

**Scope check:** Single phase, 5 tasks, all buildable and testable independently, ending in one verified working Nest process. Right-sized for one plan.
