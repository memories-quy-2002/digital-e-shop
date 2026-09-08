import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

function findPackageJson(entryPath: string, packageName: string): Record<string, unknown> {
    let directory = dirname(entryPath);

    while (directory !== parse(directory).root) {
        const packageJsonPath = join(directory, "package.json");

        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;

            if (packageJson.name === packageName) {
                return packageJson;
            }
        }

        directory = dirname(directory);
    }

    throw new Error(`Could not find package.json for ${packageName}`);
}

describe("Vercel runtime dependency compatibility", () => {
    it("keeps firebase-admin's jwks-rsa dependency on a CommonJS-compatible jose export", () => {
        const firebaseAdminEntry = require.resolve("firebase-admin");
        const jwksRsaEntry = require.resolve("jwks-rsa/src/utils.js", {
            paths: [dirname(firebaseAdminEntry)],
        });
        const joseEntry = require.resolve("jose", {
            paths: [dirname(jwksRsaEntry)],
        });
        const josePackage = findPackageJson(joseEntry, "jose");
        const rootExport = (josePackage.exports as Record<string, unknown>)["."] as Record<string, unknown>;

        expect(rootExport.require).toBeDefined();
    });
});
