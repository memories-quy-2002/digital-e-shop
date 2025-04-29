// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "jsdom", // <--- CRITICAL
        globals: true,
        setupFiles: "./src/setupTests.ts", // if you use setupTests
    },
});
