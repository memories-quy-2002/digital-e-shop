import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(clientRoot, "dist");

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

process.exit(result.status ?? 1);
