import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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
    load: "k6-api-load.js",
    capacity: "k6-vu-capacity.js",
    stress: "k6-api-stress.js",
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

    const childEnvironment = { ...process.env };
    if (profile === "load" || profile === "capacity" || profile === "stress") {
        const outputDirectory = path.join(serverDirectory, "test-results", "k6");
        await mkdir(outputDirectory, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const summaryNames = {
            load: "catalog-load",
            capacity: "catalog-vu-capacity",
            stress: "catalog-stress",
        };
        childEnvironment.K6_SUMMARY_PATH = path.join(
            "test-results",
            "k6",
            `${summaryNames[profile]}-${timestamp}.json`,
        );
    }

    const child = spawn(
        executable,
        ["run", ...forwardedArguments, scriptPath],
        {
            cwd: serverDirectory,
            env: childEnvironment,
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
