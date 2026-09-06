import { defineConfig, devices } from "@playwright/test";

const clientBaseUrl = process.env.E2E_BASE_URL || "http://localhost:5173";
const apiBaseUrl = process.env.E2E_API_URL || "http://localhost:4000";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: process.env.CI ? 1 : undefined,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
    use: {
        baseURL: clientBaseUrl,
        trace: "on-first-retry",
        screenshot: "only-on-failure",
        video: "retain-on-failure",
    },
    projects: [
        {
            name: "chromium",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: process.env.E2E_BASE_URL
        ? undefined
        : [
              {
                  command: "pnpm --filter server exec node --conditions=development --import tsx ./test/e2e-server.ts",
                  url: `${apiBaseUrl}/api/health`,
                  env: { ...process.env, NODE_ENV: "test" },
                  reuseExistingServer: !process.env.CI,
                  timeout: 120_000,
              },
              {
                  command: "pnpm --filter client start -- --host 127.0.0.1",
                  url: clientBaseUrl,
                  env: {
                      ...process.env,
                      VITE_API_BASE_URL: apiBaseUrl,
                  },
                  reuseExistingServer: !process.env.CI,
                  timeout: 120_000,
              },
          ],
});
