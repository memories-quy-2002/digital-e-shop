import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const serverDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const configPath = path.join(serverDirectory, ".env.k6");

if (existsSync(configPath)) {
    loadEnv({ path: configPath, quiet: true });
}

const profiles = {
    readonly: "performance-test.js",
    smoke: "k6-api-smoke.js",
    catalog: "k6-catalog-test.js",
    "admin-readonly": "k6-admin-readonly.js",
    "customer-readonly": "k6-customer-readonly.js",
    "auth-readonly": "k6-auth-readonly.js",
};

const profile = process.argv[2];
const scriptName = profiles[profile];

if (!scriptName) {
    console.error(
        `[k6] Unknown profile "${profile || ""}". Choose: ${Object.keys(profiles).join(", ")}.`,
    );
    process.exitCode = 2;
} else {
    const executable = process.env.K6_BIN?.trim() || "k6";
    const scriptPath = path.join(serverDirectory, "test", scriptName);
    const forwardedArguments = process.argv.slice(3);

    if (forwardedArguments[0] === "--") forwardedArguments.shift();

    const child = spawn(
        executable,
        ["run", ...forwardedArguments, scriptPath],
        {
            cwd: serverDirectory,
            env: process.env,
            stdio: "inherit",
        },
    );

    child.on("error", (error) => {
        if (error.code === "ENOENT") {
            console.error(
                `[k6] Could not find "${executable}". Install k6 and add it to PATH, or set K6_BIN in server/.env.k6.`,
            );
        } else {
            console.error(`[k6] Could not start the runner: ${error.message}`);
        }
        process.exitCode = 1;
    });

    child.on("exit", (code) => {
        process.exitCode = code ?? 1;
    });
}
