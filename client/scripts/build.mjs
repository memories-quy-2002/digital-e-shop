import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(clientRoot, "dist");
const analyzeBundle = process.argv.includes("--analyze");

if (analyzeBundle) {
    process.env.DIGITAL_E_BUNDLE_ANALYSIS = "true";
}

try {
    fs.rmSync(outputDirectory, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 100,
    });
} catch (error) {
    const errorCode = error && typeof error === "object" && "code" in error ? error.code : "unknown";

    if (![
        "EACCES",
        "EBUSY",
        "EPERM",
    ].includes(errorCode)) {
        throw error;
    }

    console.warn(
        `[build] Could not empty ${outputDirectory} (${errorCode}); continuing with Vite's emptyOutDir=false.`,
    );
}

const viteBinary = process.platform === "win32" ? "vite.cmd" : "vite";
const result = spawnSync(viteBinary, ["build", "--emptyOutDir=false"], {
    cwd: clientRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
});

if (result.error) {
    console.error(`[build] Failed to start Vite: ${result.error.message}`);
    process.exit(1);
}

if (result.status !== 0) {
    process.exit(result.status ?? 1);
}

const budgetChecker = path.join(clientRoot, "scripts", "check-bundle-budget.mjs");
const budgetResult = spawnSync(process.execPath, [budgetChecker], {
    cwd: clientRoot,
    stdio: "inherit",
});

if (budgetResult.error) {
    console.error(`[build] Failed to check bundle budgets: ${budgetResult.error.message}`);
    process.exit(1);
}

if (budgetResult.status !== 0) {
    process.exit(budgetResult.status ?? 1);
}

const manifestPath = path.join(outputDirectory, ".vite", "manifest.json");
fs.rmSync(manifestPath, { force: true });

const viteMetadataDirectory = path.dirname(manifestPath);
if (fs.existsSync(viteMetadataDirectory) && fs.readdirSync(viteMetadataDirectory).length === 0) {
    fs.rmSync(viteMetadataDirectory, { recursive: true, force: true });
}

if (analyzeBundle) {
    console.info(
        `[build] Bundle analysis report: ${path.join(clientRoot, "node_modules", ".cache", "digital-e-bundle-analysis.html")}`,
    );
}

process.exit(0);
