import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverPackagePath = path.resolve(__dirname, "../../../package.json");
const clientPackagePath = path.resolve(__dirname, "../../../../client/package.json");

const readPackage = (packagePath: string) => JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
};

describe("independent package startup", () => {
    it("prepares Prisma before server development and startup", () => {
        const packageJson = readPackage(serverPackagePath);

        expect(packageJson.scripts?.predev).toBe("pnpm prisma:prepare");
        expect(packageJson.scripts?.prestart).toBe(
            "pnpm prisma:prepare && pnpm build:compile",
        );
        expect(packageJson.scripts?.["prisma:prepare"]).toBe(
            "pnpm prisma:generate && pnpm prisma:migrate:deploy",
        );
    });

    it("exposes a client-local development script", () => {
        const packageJson = readPackage(clientPackagePath);

        expect(packageJson.scripts?.dev).toBe("vite");
    });
});
