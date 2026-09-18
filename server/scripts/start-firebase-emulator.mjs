import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const LOCAL_FIREBASE_PROJECT_ID = "demo-digital-e-local";
export const LOCAL_FIREBASE_AUTH_HOST = "127.0.0.1";
export const LOCAL_FIREBASE_AUTH_PORT = 9099;
export const FIREBASE_EMULATOR_COMMAND = "firebase emulators:start";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(scriptDirectory, "..");

export const buildFirebaseEmulatorArgs = (rootDirectory = serverRoot) => [
    "dlx",
    "--allow-build=protobufjs",
    "--allow-build=re2",
    "--package=firebase-tools",
    "firebase",
    "emulators:start",
    "--only",
    "auth",
    "--project",
    LOCAL_FIREBASE_PROJECT_ID,
    `--config=${path.resolve(rootDirectory, "..", "firebase.json")}`,
    `--import=${path.resolve(rootDirectory, "..", ".firebase", "emulator-data")}`,
    "--export-on-exit",
];

export const waitForPort = (
    host,
    port,
    { timeoutMs = 60_000, retryMs = 250, signal } = {},
) => new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let retryTimer;
    let socket;
    let settled = false;

    const cleanup = () => {
        if (retryTimer) {
            clearTimeout(retryTimer);
        }
        socket?.destroy();
        signal?.removeEventListener("abort", onAbort);
    };

    const finish = (error) => {
        if (settled) {
            return;
        }
        settled = true;
        cleanup();
        if (error) {
            reject(error);
        } else {
            resolve();
        }
    };

    const onAbort = () => finish(new Error(`Timed out waiting for ${host}:${port}`));

    const retry = () => {
        if (settled) {
            return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
            finish(new Error(`Timed out waiting for ${host}:${port}`));
            return;
        }
        retryTimer = setTimeout(attempt, retryMs);
    };

    const attempt = () => {
        if (settled) {
            return;
        }
        socket = net.createConnection({ host, port });
        socket.once("connect", () => finish());
        socket.once("error", retry);
    };

    if (signal?.aborted) {
        onAbort();
        return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    attempt();
});

const waitForChild = (child) => new Promise((resolve, reject) => {
    let settled = false;

    child.once("error", (error) => {
        if (settled) {
            return;
        }
        settled = true;
        reject(error);
    });
    child.once("exit", (code, signal) => {
        if (settled) {
            return;
        }
        settled = true;
        resolve({ code: code ?? 1, signal });
    });
});

const terminateChild = (child) => {
    if (child && child.exitCode === null && child.signalCode === null) {
        child.kill();
    }
};

const localEnvironment = () => ({
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || "development",
    FIREBASE_AUTH_EMULATOR_HOST: `${LOCAL_FIREBASE_AUTH_HOST}:${LOCAL_FIREBASE_AUTH_PORT}`,
    FIREBASE_PROJECT_ID: LOCAL_FIREBASE_PROJECT_ID,
});

export const startFirebaseEmulator = async () => {
    const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const emulator = spawn(pnpmCommand, buildFirebaseEmulatorArgs(), {
        cwd: serverRoot,
        env: localEnvironment(),
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    let seeder;
    let interrupted = false;
    const emulatorExit = waitForChild(emulator);
    const onSignal = () => {
        interrupted = true;
        terminateChild(seeder);
        terminateChild(emulator);
    };

    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    try {
        console.log(`Starting ${FIREBASE_EMULATOR_COMMAND} for ${LOCAL_FIREBASE_PROJECT_ID}...`);
        const readinessAbort = new AbortController();
        try {
            await Promise.race([
                waitForPort(LOCAL_FIREBASE_AUTH_HOST, LOCAL_FIREBASE_AUTH_PORT, {
                    signal: readinessAbort.signal,
                }),
                emulatorExit.then(({ code, signal }) => {
                    throw new Error(
                        `Firebase Auth Emulator exited before becoming ready (code=${code}, signal=${signal || "none"})`,
                    );
                }),
            ]);
        } finally {
            readinessAbort.abort();
        }

        seeder = spawn(process.execPath, [
            path.join(serverRoot, "src", "database", "seeders", "seedFirebaseEmulatorUsers.js"),
        ], {
            cwd: serverRoot,
            env: localEnvironment(),
            stdio: "inherit",
        });

        const seedResult = await Promise.race([
            waitForChild(seeder),
            emulatorExit.then(() => {
                throw new Error("Firebase Auth Emulator exited while demo users were being seeded");
            }),
        ]);
        if (seedResult.code !== 0) {
            throw new Error(`Firebase Auth Emulator demo seeding failed (code=${seedResult.code})`);
        }

        console.log("Firebase Auth Emulator is ready with demo users");
        const emulatorResult = await emulatorExit;
        return interrupted || emulatorResult.code === 0 ? 0 : 1;
    } catch (error) {
        if (!interrupted) {
            console.error(error instanceof Error ? error.message : String(error));
        }
        terminateChild(seeder);
        terminateChild(emulator);
        await emulatorExit.catch(() => undefined);
        return interrupted ? 0 : 1;
    } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
    }
};

const isMainModule = process.argv[1]
    && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
    startFirebaseEmulator().then((exitCode) => {
        process.exitCode = exitCode;
    });
}
