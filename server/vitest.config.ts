import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Mirror the "#src/*" subpath import used across the server runtime so tests
// resolve modules the same way the app does.
const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
    test: {
        environment: "node",
        globals: true,
        env: {
            // Prisma validates the URL during module import. Unit tests never
            // need a database, so keep their connection target local and closed.
            NODE_ENV: "test",
            DB_HOST: "127.0.0.1",
            DB_PORT: "1",
            DB_USER: "test",
            DB_PASSWORD: "test-only",
            DB_NAME: "digital_e_shop_test",
            DATABASE_URL: "mysql://test:test-only@127.0.0.1:1/digital_e_shop_test",
            ALLOW_REMOTE_DATABASE: "false",
        },
        include: ["src/**/*.{test,spec}.ts"],
        exclude: ["src/**/*.integration.test.ts", "src/**/*.integration.spec.ts"],
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
