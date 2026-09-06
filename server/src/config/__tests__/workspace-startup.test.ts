import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspacePackagePath = path.resolve(__dirname, "../../../../package.json");

describe("workspace startup", () => {
    it("builds the server before starting the compiled entrypoint", () => {
        const packageJson = JSON.parse(fs.readFileSync(workspacePackagePath, "utf8")) as {
            scripts?: {
                prestart?: string;
            };
        };

        expect(packageJson.scripts?.prestart).toBe(
            "corepack pnpm@12.3.4 --filter server build:compile",
        );
    });
});
