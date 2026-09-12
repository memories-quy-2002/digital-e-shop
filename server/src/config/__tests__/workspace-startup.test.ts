import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const serverPackagePath = path.resolve(__dirname, "../../../package.json");
const clientPackagePath = path.resolve(__dirname, "../../../../client/package.json");

const readPackage = (packagePath: string) => JSON.parse(fs.readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
};

describe("independent package startup", () => {
    it("generates Prisma before development and keeps migrations and seeds explicit", () => {
        const packageJson = readPackage(serverPackagePath);
        const pnpmCommand = "corepack pnpm@12.3.4";

        expect(packageJson.scripts?.predev).toBe(`${pnpmCommand} prisma:generate`);
        expect(packageJson.scripts?.prestart).toBe(
            `${pnpmCommand} prisma:prepare && ${pnpmCommand} build:compile`,
        );
        expect(packageJson.scripts?.["prisma:prepare"]).toBe(
            `${pnpmCommand} prisma:generate && ${pnpmCommand} prisma:migrate:deploy`,
        );
        expect(packageJson.scripts?.["seed:demo"]).toBe(`${pnpmCommand} prisma:seed`);
    });

    it("exposes a client-local development script", () => {
        const packageJson = readPackage(clientPackagePath);

        expect(packageJson.scripts?.dev).toBe("vite");
    });
});
