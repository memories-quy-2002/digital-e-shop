# Secure Dependencies and Product Image Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the two open CodeQL path-injection findings and remediate the 33 open Dependabot alerts without introducing unreviewed major-version or runtime behavior changes.

**Architecture:** Keep the existing NestJS products controller and `/products/images/:filename` response contract. Add a small path-resolution boundary that validates the route value, resolves it below the upload root, and returns the existing 404 response for invalid names. Refresh the pnpm workspace lockfile through compatible dependency ranges first; use dependency overrides only when the affected consumer remains compatible and the server/client verification suite passes.

**Tech Stack:** NestJS 11, TypeScript, Node `node:path`/`node:fs`, Vitest, pnpm 11.5.3, GitHub Dependabot and CodeQL.

## Global Constraints

- Use pnpm only; do not add npm or yarn lockfiles.
- Never modify or push `main`; all implementation stays on `bugfix/secure-dependencies-and-image-path` and goes through a pull request.
- Preserve the `/products/images/:filename` route, JPEG behavior, response messages, auth/CSRF/CORS behavior, and existing API contracts.
- Do not upgrade Prisma or NestJS across a major version as part of this remediation.
- Do not force a dependency major version outside its declared consumer range without a scoped compatibility test and explicit risk report.
- Do not commit secrets, generated local environment files, or unrelated lockfile churn.
- Use a failing regression test before changing production code.

---

### Task 1: Add a failing path-boundary regression test

**Files:**
- Create: `server/src/products/__tests__/products.controller.test.ts`
- Read: `server/src/products/products.controller.ts`

**Interfaces:**
- The test will consume `resolveProductImagePath(filename, baseDirectory?)` exported from `products.controller.ts`.
- The resolver will produce `{ requestedFilename: string; imagePath: string }` for a safe basename, or `null` for a path-bearing value.

- [ ] **Step 1: Write the failing test**

Create `server/src/products/__tests__/products.controller.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { resolveProductImagePath } from "../products.controller";

describe("resolveProductImagePath", () => {
    const uploadsDirectory = resolve("C:/digital-e-shop-test/uploads");

    it("resolves a product image basename below the upload directory", () => {
        expect(resolveProductImagePath("apple-iphone-13", uploadsDirectory)).toEqual({
            requestedFilename: "apple-iphone-13.jpg",
            imagePath: resolve(uploadsDirectory, "apple-iphone-13.jpg"),
        });
    });

    it.each(["../package", "..\\package", "nested/image", "C:\\Windows\\win.ini", ""]) (
        "rejects a path-bearing or empty image name: %s",
        (filename) => {
            expect(resolveProductImagePath(filename, uploadsDirectory)).toBeNull();
        },
    );
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
corepack pnpm --filter server exec vitest run src/products/__tests__/products.controller.test.ts
```

Expected: the test fails because `resolveProductImagePath` is not exported yet. Do not change the test to make this failure disappear.

---

### Task 2: Implement the minimal safe image resolver

**Files:**
- Modify: `server/src/products/products.controller.ts:19-97`
- Test: `server/src/products/__tests__/products.controller.test.ts`

**Interfaces:**
- `resolveProductImagePath(filename: string, baseDirectory?: string): { requestedFilename: string; imagePath: string } | null`.
- `ProductsController.getImage()` will call the resolver before `existsSync()` or `createReadStream()` and will keep returning `{ msg: "Image not found" }` with HTTP 404 for invalid or missing files.

- [ ] **Step 1: Implement the resolver and use it at the filesystem boundary**

Replace the `join` import and image-path block with this implementation:

```ts
import { basename, isAbsolute, relative, resolve } from "node:path";

const uploadsDir = resolve(process.cwd(), "src", "uploads");

export function resolveProductImagePath(
    filename: string,
    baseDirectory: string = uploadsDir,
): { requestedFilename: string; imagePath: string } | null {
    if (typeof filename !== "string" || filename.length === 0) {
        return null;
    }

    const requestedFilename = `${filename}.jpg`;
    if (basename(requestedFilename) !== requestedFilename) {
        return null;
    }

    const safeBaseDirectory = resolve(baseDirectory);
    const imagePath = resolve(safeBaseDirectory, requestedFilename);
    const relativeImagePath = relative(safeBaseDirectory, imagePath);

    if (relativeImagePath.startsWith("..") || isAbsolute(relativeImagePath)) {
        return null;
    }

    return { requestedFilename, imagePath };
}
```

Update `getImage()` to use the returned object:

```ts
const resolvedImage = resolveProductImagePath(filename);
if (!resolvedImage) {
    throw new HttpException({ msg: "Image not found" }, 404);
}

const fs = await import("node:fs");
if (!fs.existsSync(resolvedImage.imagePath)) {
    throw new HttpException({ msg: "Image not found" }, 404);
}

res.set({
    "Content-Type": "image/jpeg",
    "Content-Disposition": `inline; filename="${encodeURIComponent(resolvedImage.requestedFilename)}"`,
});

const stream = createReadStream(resolvedImage.imagePath);
return new StreamableFile(stream);
```

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```powershell
corepack pnpm --filter server exec vitest run src/products/__tests__/products.controller.test.ts
```

Expected: 6 tests pass with no path escaping accepted.

- [ ] **Step 3: Inspect the diff for behavior and security regressions**

Run:

```powershell
git diff --check
git diff -- server/src/products/products.controller.ts server/src/products/__tests__/products.controller.test.ts
```

Confirm that only the image path boundary, safe header encoding, and its test changed; the route path, status code, success content type, and missing-file message remain unchanged.

---

### Task 3: Refresh vulnerable transitive dependencies within existing ranges

**Files:**
- Modify: `pnpm-lock.yaml`
- Do not modify: `client/package.json` or `server/package.json` unless a direct package range is proven to exclude the patched compatible release.

**Interfaces:**
- The workspace continues to use the existing package manifests and pnpm lockfile.
- The expected patched lockfile floors are: `undici >=7.29.0`, `js-yaml >=3.15.1`, `brace-expansion >=1.1.18`, `ip-address >=10.3.1`, `mariadb >=3.4.7` (the published maintenance release above the advisory floor 3.4.6), `mysql2 >=3.23.1`, `multer >=2.2.0`, `browserslist >=4.28.7`, `qs >=6.16.0`, and `deepmerge-ts >=8.0.0`.

- [ ] **Step 1: Refresh compatible dependency resolutions**

Run:

```powershell
corepack pnpm update --recursive
```

Expected: pnpm updates transitive packages within their existing declared ranges and regenerates only the workspace lockfile or manifest entries required by that resolution.

- [ ] **Step 2: Inspect vulnerable package entries and parent ranges**

Run:

```powershell
rg -n "^(  (brace-expansion|browserslist|deepmerge-ts|ip-address|js-yaml|mariadb|multer|mysql2|qs|undici)@|    (brace-expansion|browserslist|deepmerge-ts|ip-address|js-yaml|mariadb|multer|mysql2|qs|undici):)" pnpm-lock.yaml
corepack pnpm why --recursive undici
corepack pnpm why --recursive multer
corepack pnpm why --recursive mysql2
corepack pnpm why --recursive deepmerge-ts
```

Confirm no vulnerable copy remains for the first nine packages. Treat `deepmerge-ts` separately because Prisma 7.10.0 currently pins 7.1.5 while the security fix is 8.0.0.

- [ ] **Step 3: Apply only compatible scoped overrides if compatible-range refresh leaves alerts**

If `multer`, `mysql2`, or another package remains vulnerable only because a transitive parent pins an older patch release, add the smallest possible root `overrides` entry in `pnpm-workspace.yaml`, scoped to that dependency where possible, then run `corepack pnpm install`. Do not add a global override that changes unrelated major lines such as `brace-expansion@5` or `undici@6`.

For `deepmerge-ts`, do not upgrade Prisma to the Prisma 8 prerelease and do not add an unscoped major override. Keep Prisma 7.10.0 unless the scoped `@prisma/config>deepmerge-ts` override to 8.0.0 in `pnpm-workspace.yaml` is verified by Prisma generation, server typecheck, server build, and the full server test suite; if those checks are not all green, remove that override and leave the alert documented as a compatibility hold.

- [ ] **Step 4: Run the dependency audit and inspect the resulting diff**

Run:

```powershell
corepack pnpm audit --prod
git diff --stat
git diff --check
git diff -- package.json client/package.json server/package.json pnpm-lock.yaml
```

Expected: no high/medium production vulnerability remains from the listed packages, or any remaining alert is explicitly documented with its parent, version constraint, and compatibility reason. Reject unrelated direct dependency upgrades or large lockfile churn.

---

### Task 4: Full verification and GitHub security recheck

**Files:**
- Read: `server/src/products/products.controller.ts`
- Read: `pnpm-lock.yaml`
- No additional source files should change unless a verification failure identifies a direct compatibility issue.

- [ ] **Step 1: Run backend verification**

Run:

```powershell
corepack pnpm --filter server typecheck
corepack pnpm --filter server lint
corepack pnpm --filter server test -- --run
corepack pnpm --filter server build
```

Expected: all commands exit 0. Existing expected test logging may remain, but no test failure or TypeScript/lint error is acceptable.

- [ ] **Step 2: Run frontend verification**

Run:

```powershell
corepack pnpm --filter client exec tsc -p tsconfig.json --noEmit
corepack pnpm --filter client lint
corepack pnpm --filter client test -- --run
corepack pnpm --filter client build
```

Expected: all commands exit 0; existing non-error lint warnings must be reported rather than hidden.

- [ ] **Step 3: Recheck GitHub alerts through the local CLI**

Run:

```powershell
gh api --paginate "repos/memories-quy-2002/digital-e-shop/dependabot/alerts?state=open&per_page=100" --jq ".[] | [.number, .security_advisory.severity, .dependency.package.name, .security_vulnerability.first_patched_version.identifier] | @tsv"
gh api --paginate "repos/memories-quy-2002/digital-e-shop/code-scanning/alerts?state=open&per_page=100" --jq ".[] | [.number, .rule.id, .rule.security_severity_level, .most_recent_instance.location.path, .most_recent_instance.location.start_line] | @tsv"
```

Expected: the two path-injection alerts are closed by a fresh CodeQL run, and Dependabot no longer reports the remediated package versions. Any compatibility hold must remain visible and explained.

- [ ] **Step 4: Review and hand off without touching main**

Run:

```powershell
git status --short --branch
git diff --check
git diff --name-only main...HEAD
```

Confirm no secrets, environment files, generated database changes, or unrelated source changes are present. Commit with `fix(security): remediate dependency and image path findings`; do not push or merge without the user’s explicit direction.
