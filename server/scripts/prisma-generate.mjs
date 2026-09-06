import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const lockDirectory = path.resolve(".prisma-generate.lock");
const lockOwnerFile = path.join(lockDirectory, "owner.json");
const lockTimeoutMs = Number(process.env.PRISMA_GENERATE_LOCK_TIMEOUT_MS || 120000);
const generateMaxAttempts = Math.max(1, Number(process.env.PRISMA_GENERATE_RETRIES || 5));
const lockRetryMs = 250;

const wait = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

async function acquireLock() {
    const startedAt = Date.now();

    while (true) {
        try {
            await mkdir(lockDirectory);
            await writeFile(
                lockOwnerFile,
                JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
                "utf8",
            );
            return;
        } catch (error) {
            if (error?.code !== "EEXIST") {
                throw error;
            }

            if (Date.now() - startedAt >= lockTimeoutMs) {
                throw new Error(
                    `Timed out waiting for another Prisma generate process. ` +
                        `If no Prisma process is running, remove ${lockDirectory} and retry.`,
                );
            }

            await wait(lockRetryMs);
        }
    }
}

function runPrismaGenerate() {
    const prismaCli = path.resolve("node_modules", "prisma", "build", "index.js");

    const runOnce = () => new Promise((resolve, reject) => {
        const child = spawn(
            process.execPath,
            [prismaCli, "generate", "--schema=src/database/prisma/schema.prisma"],
            {
                cwd: process.cwd(),
                env: process.env,
                stdio: "inherit",
            },
        );

        child.once("error", reject);
        child.once("exit", (code, signal) => {
            if (signal) {
                reject(new Error(`Prisma generate was terminated by signal ${signal}.`));
                return;
            }

            resolve(code ?? 1);
        });
    });

    return (async () => {
        for (let attempt = 1; attempt <= generateMaxAttempts; attempt += 1) {
            const exitCode = await runOnce();
            if (exitCode === 0 || attempt === generateMaxAttempts) {
                return exitCode;
            }

            console.warn(
                `Prisma generate failed on attempt ${attempt}/${generateMaxAttempts}; retrying...`,
            );
            await wait(attempt * 500);
        }

        return 1;
    })();
}

let lockAcquired = false;

try {
    await acquireLock();
    lockAcquired = true;
    const exitCode = await runPrismaGenerate();
    process.exitCode = exitCode;
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
} finally {
    if (lockAcquired) {
        try {
            await rm(lockDirectory, { recursive: true, force: true });
        } catch (error) {
            console.error(`Failed to remove Prisma generate lock: ${error}`);
            process.exitCode = 1;
        }
    }
}
