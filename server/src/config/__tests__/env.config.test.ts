import { describe, expect, it } from "vitest";
import path from "node:path";
import { resolveServerRoot } from "../env.config";

describe("resolveServerRoot", () => {
    it("resolves the server root from source and compiled module paths", () => {
        const serverRoot = process.cwd();

        expect(resolveServerRoot(path.join(serverRoot, "src", "config"))).toBe(serverRoot);
        expect(resolveServerRoot(path.join(serverRoot, "dist", "src", "config"))).toBe(serverRoot);
    });
});
