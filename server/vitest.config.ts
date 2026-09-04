import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the "#src/*" subpath import used across the server runtime so tests
// resolve modules the same way the app does.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        include: ["src/**/*.test.ts"],
        exclude: ["src/**/*.integration.test.ts"],
        // Register tsx's CJS hook (see vitest.setup.ts) so the CommonJS
        // `require("./x")` calls inside server modules resolve sibling .ts
        // files the same way they do at runtime.
        setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
        alias: {
            "#src": srcDir,
        },
    },
});
