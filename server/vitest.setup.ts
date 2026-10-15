// Nest's DI relies on reflect-metadata being registered globally before any
// decorated class loads — required for @nestjs/testing's Test.createTestingModule.
import "reflect-metadata";
import os from "node:os";
import { createRequire } from "node:module";

// Server modules use CommonJS `require("./sibling")` to load sibling .ts files
// (resolved by tsx at runtime). Register tsx's CJS hook so those in-module
// requires resolve .ts the same way during tests, instead of Node's bare
// require failing to find the extensionless module.
// tsx uses os.userInfo() only to name its temporary IPC channel. Some Windows
// runners fail that OS lookup with uv_os_get_passwd/ENOMEM, so use the existing
// account name only when that specific lookup fails.
const originalUserInfo = os.userInfo.bind(os);
Object.defineProperty(os, "userInfo", {
    configurable: true,
    value: () => {
        try {
            return originalUserInfo();
        } catch (error) {
            const systemError = error as NodeJS.ErrnoException & {
                info?: { syscall?: string };
            };
            if (
                process.platform !== "win32" ||
                (systemError.syscall !== "uv_os_get_passwd" &&
                    systemError.info?.syscall !== "uv_os_get_passwd")
            ) {
                throw error;
            }

            return {
                username: process.env.USERNAME ?? process.env.USER ?? "vitest",
                uid: -1,
                gid: -1,
                shell: null,
                homedir: os.homedir(),
            };
        }
    },
});
createRequire(import.meta.url)("tsx/cjs");

// Firebase is the only auth provider, so env.config validates Firebase settings
// as soon as server modules are imported. Unit tests should use the isolated Auth
// Emulator profile rather than requiring production service-account credentials.
process.env.FIREBASE_PROJECT_ID ??= "demo-digital-e-local";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
