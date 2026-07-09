# NestJS Cold-Start Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal, throwaway NestJS app deployed to a Vercel serverless preview, and measure its cold/warm invocation latency against the current bare-Express `/api/health` baseline, to gate the decision on whether the full NestJS migration keeps the current serverless deployment model.

**Architecture:** A standalone `NestFactory.create(AppModule)` bootstrap with a single health controller, wired into a new Vercel serverless entrypoint that caches the compiled Nest app/Express adapter across invocations (module-level singleton). Deployed as a separate preview (not touching the current `server/api/index.ts` or `server/vercel.json`) so the existing production Express app is completely unaffected. Latency is measured with repeated cold (post-idle) and warm (back-to-back) requests against both the new Nest preview and the existing `/api/health` baseline, using the same measurement method for both so the comparison is apples-to-apples.

**Tech Stack:** NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`), `@vercel/node`, existing Vercel project tooling, `curl`/`Invoke-WebRequest` timing for measurement (no new load-testing dependency needed for a handful of requests).

## Global Constraints

- Do not modify `server/src/app.ts`, `server/api/index.ts`, or `server/vercel.json` — the production Express app and its deployment must remain untouched during the spike (per spec: this is a gated decision point, not a live cutover).
- Do not add the new Nest dependencies to `server/package.json` — use a fully separate `spike/nestjs-coldstart/` directory with its own `package.json` so the spike can be deleted cleanly regardless of outcome, and so it never affects `pnpm install` or the build of the real server.
- Use pnpm only, consistent with the rest of the repo (per [AGENTS.md](../../../AGENTS.md)).
- No fixed pass/fail latency threshold exists yet (per spec) — this plan's deliverable is the raw comparison data and a written recommendation, not a go/no-go code change.
- This work happens on the `feature/nestjs-migration-spec` branch (already created, currently checked out) — do not merge to `main` until the user reviews the results.

---

### Task 1: Scaffold the standalone spike Nest app

**Files:**
- Create: `spike/nestjs-coldstart/package.json`
- Create: `spike/nestjs-coldstart/tsconfig.json`
- Create: `spike/nestjs-coldstart/src/app.module.ts`
- Create: `spike/nestjs-coldstart/src/health.controller.ts`
- Create: `spike/nestjs-coldstart/src/main.ts` (local dev bootstrap only, not used by Vercel)

**Interfaces:**
- Produces: `AppModule` (Nest module class, default export not required — named export `AppModule`) consumed by Task 2's Vercel handler.
- Produces: `HealthController` with a `GET /health` route returning `{ status: "ok", timestamp: string }` — same shape as the real server's `/api/health` for a fair comparison.

- [ ] **Step 1: Create the spike package directory and package.json**

```json
{
  "name": "nestjs-coldstart-spike",
  "version": "0.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "express": "^5.2.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/node": "^26.1.0",
    "@vercel/node": "^5.4.1",
    "typescript": "^5.7.3"
  }
}
```

Path: `spike/nestjs-coldstart/package.json` (repo root has no `spike/` directory yet — verify with `ls spike 2>/dev/null || echo none` before creating).

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*", "api/**/*"]
}
```

Path: `spike/nestjs-coldstart/tsconfig.json`

Note: `experimentalDecorators` + `emitDecoratorMetadata` are required for Nest's decorators (`@Module`, `@Controller`, `@Get`) to work — the main `server/tsconfig.json` doesn't set these because it doesn't use decorators today, so this is a spike-local config, not something to backport.

- [ ] **Step 3: Write the health controller**

```typescript
import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get("health")
  getHealth() {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
```

Path: `spike/nestjs-coldstart/src/health.controller.ts`

- [ ] **Step 4: Write the app module**

```typescript
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";

@Module({
  controllers: [HealthController],
})
export class AppModule {}
```

Path: `spike/nestjs-coldstart/src/app.module.ts`

- [ ] **Step 5: Write a local dev bootstrap for a quick sanity check**

```typescript
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3999);
  console.log("Spike Nest app listening on http://localhost:3999");
}

bootstrap();
```

Path: `spike/nestjs-coldstart/src/main.ts`

- [ ] **Step 6: Install dependencies and verify local boot**

Run:
```bash
cd spike/nestjs-coldstart
pnpm install
pnpm exec tsc -p tsconfig.json --noEmit
```
Expected: no type errors.

Then run locally to confirm the module wires up correctly:
```bash
pnpm exec ts-node src/main.ts 2>/dev/null || node --loader ts-node/esm src/main.ts
```
If `ts-node` isn't installed, instead build and run compiled JS:
```bash
pnpm run build
node dist/main.js
```
In another terminal:
```bash
curl http://localhost:3999/health
```
Expected: `{"status":"ok","timestamp":"..."}`. Stop the process (Ctrl+C) once confirmed.

- [ ] **Step 7: Commit**

```bash
git add spike/nestjs-coldstart/package.json spike/nestjs-coldstart/tsconfig.json spike/nestjs-coldstart/src/app.module.ts spike/nestjs-coldstart/src/health.controller.ts spike/nestjs-coldstart/src/main.ts
git commit -m "spike(nestjs): scaffold standalone Nest app for cold-start test"
```

---

### Task 2: Wire the spike app into a Vercel serverless handler with a cached instance

**Files:**
- Create: `spike/nestjs-coldstart/api/index.ts`
- Create: `spike/nestjs-coldstart/vercel.json`

**Interfaces:**
- Consumes: `AppModule` from Task 1 (`../src/app.module`).
- Produces: a default-exported Vercel serverless function handler `(req, res) => Promise<void>` that Task 3's deployment step targets.

- [ ] **Step 1: Write the cached-instance Vercel handler**

```typescript
import "reflect-metadata";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Express } from "express";
import { AppModule } from "../src/app.module";

let cachedServer: Express | null = null;

async function bootstrapServer(): Promise<Express> {
  const expressApp = express();
  const adapter = new ExpressAdapter(expressApp);
  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: false,
  });
  await nestApp.init();
  return expressApp;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!cachedServer) {
    cachedServer = await bootstrapServer();
  }
  cachedServer(req as never, res as never);
}
```

Path: `spike/nestjs-coldstart/api/index.ts`

This mirrors the caching pattern described in the spec (Step 0): `cachedServer` is a module-level variable, so it persists across invocations on the same warm Lambda instance but is `null` on a fresh cold start — exactly the condition being measured.

**Known risk:** the exact `@vercel/node` handler signature and its compatibility with Nest 11 + Express 5 types has not been verified against current package docs as of writing this plan. If `tsc` in Step 3 reports type errors on the `handler` signature or `ExpressAdapter` constructor, check the installed `@nestjs/platform-express` and `@vercel/node` versions' actual exported types (`node_modules/@vercel/node/dist/index.d.ts` and `node_modules/@nestjs/platform-express/adapters/express-adapter.d.ts`) rather than assuming the signature above is exact — adjust the handler to match what's actually installed.

- [ ] **Step 2: Write vercel.json for the spike**

```json
{
  "version": 2,
  "buildCommand": "pnpm install && pnpm run build",
  "outputDirectory": "dist",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index.ts"
    }
  ]
}
```

Path: `spike/nestjs-coldstart/vercel.json`

- [ ] **Step 3: Typecheck the handler**

Run:
```bash
cd spike/nestjs-coldstart
pnpm exec tsc -p tsconfig.json --noEmit
```
Expected: no type errors. If `VercelRequest`/`VercelResponse` types are missing, confirm `@vercel/node` is in `devDependencies` (added in Task 1) and re-run `pnpm install`.

- [ ] **Step 4: Commit**

```bash
git add spike/nestjs-coldstart/api/index.ts spike/nestjs-coldstart/vercel.json
git commit -m "spike(nestjs): add cached Vercel serverless handler"
```

---

### Task 3: Deploy the spike to a Vercel preview and capture baseline + Nest latency

**Files:**
- Create: `spike/nestjs-coldstart/RESULTS.md` (raw measurement data, not a permanent doc — lives only on this branch until the decision is made)

**Interfaces:**
- Consumes: the deployed preview URL for the spike app (from `vercel deploy` output) and the existing production/preview URL for the current server's `/api/health`.
- Produces: `RESULTS.md` containing the comparison table Task 4 reads to write the recommendation.

- [ ] **Step 1: Confirm Vercel CLI is available and authenticated**

Run:
```bash
vercel --version
vercel whoami
```
Expected: a version string and a logged-in username. If not authenticated, stop and ask the user to run `vercel login` interactively — do not attempt to automate login.

- [ ] **Step 2: Deploy the spike as a new, separate Vercel project**

Run from `spike/nestjs-coldstart/`:
```bash
cd spike/nestjs-coldstart
vercel --yes --name digital-e-nestjs-spike
```
This creates a **new, separate** Vercel project (not linked to the existing `digital-e-shop` server project), so it cannot affect production traffic or config. Expected output: a deployment URL like `https://digital-e-nestjs-spike-<hash>.vercel.app`.

Note the URL — it's needed for Step 4.

- [ ] **Step 3: Confirm the deployed spike responds correctly**

Run (replace `<spike-url>` with the URL from Step 2):
```bash
curl -s https://<spike-url>/health
```
Expected: `{"status":"ok","timestamp":"..."}`, HTTP 200.

- [ ] **Step 4: Measure cold-start latency for the spike**

A true cold start requires the Lambda to have been idle long enough to be evicted (Vercel typically evicts after ~5-15 min of inactivity, varies by plan). Since we can't force eviction, use this practical approach: make one request, wait, and treat the *first* request after a gap of several minutes as "cold", subsequent immediate requests as "warm".

Run:
```bash
curl -s -o /dev/null -w "cold: %{time_total}s\n" https://<spike-url>/health
```
Wait at least 10 minutes (or run this at the start of a work session before the first request), then repeat the same command and record it as the cold sample. Then immediately run 5 more times back-to-back and record as warm samples:
```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "warm[$i]: %{time_total}s\n" https://<spike-url>/health
done
```

- [ ] **Step 5: Measure the same for the current production/preview Express baseline**

Using the existing deployed server's health endpoint (find the current preview/production URL from `vercel ls` in the real `server/` project, or ask the user for it if ambiguous), run the same cold+warm measurement:
```bash
curl -s -o /dev/null -w "baseline cold: %{time_total}s\n" https://<existing-server-url>/api/health
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "baseline warm[$i]: %{time_total}s\n" https://<existing-server-url>/api/health
done
```

- [ ] **Step 6: Record bundle size**

Run:
```bash
cd spike/nestjs-coldstart
du -sh dist/ 2>/dev/null || echo "build dist/ first: pnpm run build"
```
Compare against the existing server's `dist/` size:
```bash
du -sh ../../server/dist/ 2>/dev/null || echo "server not built locally"
```

- [ ] **Step 7: Write RESULTS.md with the raw data**

```markdown
# Cold-Start Spike Results

Date: <fill in actual date>

## Nest spike (Vercel, cached instance)
- Cold: <value>s
- Warm (5 samples): <values>s, avg <value>s

## Express baseline (current production server)
- Cold: <value>s
- Warm (5 samples): <values>s, avg <value>s

## Bundle size
- Nest spike dist/: <value>
- Express server dist/: <value>

## Delta
- Cold-start overhead: Nest cold - Express cold = <value>s
- Warm-request overhead: Nest warm avg - Express warm avg = <value>s
```

Path: `spike/nestjs-coldstart/RESULTS.md` — fill in with the actual numbers from Steps 4-6, not placeholders.

- [ ] **Step 8: Commit results**

```bash
git add spike/nestjs-coldstart/RESULTS.md
git commit -m "spike(nestjs): record cold-start latency comparison results"
```

---

### Task 4: Write the recommendation and present the decision gate to the user

**Files:**
- Modify: `docs/superpowers/specs/2026-07-08-nestjs-migration-design.md` (append a "Step 0 Results" section under the existing "Step 0 — Cold-start spike" heading)

**Interfaces:**
- Consumes: `spike/nestjs-coldstart/RESULTS.md` from Task 3.
- Produces: an updated spec with a filled-in decision, which either unblocks writing the full migration plan (Tasks in a future plan covering Sections 2-3 of the spec) or triggers a hosting-model discussion before any further planning.

- [ ] **Step 1: Read the recorded results**

Read `spike/nestjs-coldstart/RESULTS.md` in full.

- [ ] **Step 2: Append a Step 0 Results section to the spec**

Add this section immediately after the existing "Step 0 — Cold-start spike" section in `docs/superpowers/specs/2026-07-08-nestjs-migration-design.md`:

```markdown
### Step 0 Results (measured <date>)

- Nest cold start: <value>s vs. Express baseline <value>s (delta: <value>s)
- Nest warm request: <value>s avg vs. Express baseline <value>s avg (delta: <value>s)
- Bundle size: Nest <value> vs. Express <value>

**Recommendation:** <one paragraph — either "proceed with serverless + cached Nest instance" with reasoning, or "cold-start overhead is significant enough to warrant discussing a long-running hosting target before continuing" with the specific numbers driving that call>
```

Use the actual measured values from Task 3 — do not leave any `<value>` placeholder unfilled.

- [ ] **Step 3: Commit the updated spec**

```bash
git add docs/superpowers/specs/2026-07-08-nestjs-migration-design.md
git commit -m "docs: record NestJS cold-start spike results and recommendation"
```

- [ ] **Step 4: Present the decision to the user**

Do not proceed to plan the rest of the migration (Sections 2-3 of the spec: module structure mapping, migration order) until the user has seen `RESULTS.md` and the recommendation, and has explicitly confirmed whether to proceed with serverless or revisit hosting. This is a hard stop per the spec's decision gate.

---

## Post-plan note

Regardless of the Step 0 outcome, the `spike/nestjs-coldstart/` directory is throwaway scaffolding, not the seed of the real migration — the real `AppModule` gets built fresh inside `server/src` during the actual migration (per spec Section "Migration order", Task 1: Scaffolding), following whatever hosting decision Step 0 produces. Delete or archive `spike/nestjs-coldstart/` once the decision is recorded, unless the user wants to keep it as a reference.
