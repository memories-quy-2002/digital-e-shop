import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["src/**/*.{integration.test,integration.spec}.ts"],
        setupFiles: ["./vitest.setup.ts"],
        hookTimeout: 30000,
        testTimeout: 30000,
    },
    resolve: {
        alias: {
            "#src": srcDir,
        },
    },
});
