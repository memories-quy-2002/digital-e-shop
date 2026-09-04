// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(clientRoot, "src"),
        },
    },
    test: {
        environment: "jsdom", // <--- CRITICAL
        globals: true,
        setupFiles: "./src/setupTests.ts", // if you use setupTests
    },
});
