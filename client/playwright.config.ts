import { defineConfig } from "@playwright/test";

const browserBaseUrl = process.env.RETAIL_P0_CLIENT_URL || "http://127.0.0.1:5173";

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    retries: 0,
    reporter: "list",
    outputDir: "./test-results/retail-p0",
    use: {
        baseURL: browserBaseUrl,
        browserName: "chromium",
        headless: true,
        screenshot: "off",
        trace: "off",
        video: "off",
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },
    projects: [
        { name: "desktop-en-light", use: { viewport: { width: 1440, height: 900 }, locale: "en-US" }, metadata: { locale: "en", theme: "light" } },
        { name: "desktop-en-dark", use: { viewport: { width: 1440, height: 900 }, locale: "en-US" }, metadata: { locale: "en", theme: "dark" } },
        { name: "desktop-vi-light", use: { viewport: { width: 1440, height: 900 }, locale: "vi-VN" }, metadata: { locale: "vi", theme: "light" } },
        { name: "desktop-vi-dark", use: { viewport: { width: 1440, height: 900 }, locale: "vi-VN" }, metadata: { locale: "vi", theme: "dark" } },
        { name: "mobile-en-light", use: { viewport: { width: 390, height: 844 }, locale: "en-US" }, metadata: { locale: "en", theme: "light" } },
        { name: "mobile-en-dark", use: { viewport: { width: 390, height: 844 }, locale: "en-US" }, metadata: { locale: "en", theme: "dark" } },
        { name: "mobile-vi-light", use: { viewport: { width: 390, height: 844 }, locale: "vi-VN" }, metadata: { locale: "vi", theme: "light" } },
        { name: "mobile-vi-dark", use: { viewport: { width: 390, height: 844 }, locale: "vi-VN" }, metadata: { locale: "vi", theme: "dark" } },
    ],
    webServer: {
        command: "corepack pnpm@12.4.2 exec vite --host 127.0.0.1",
        url: browserBaseUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 60000,
        env: {
            VITE_API_BASE_URL: process.env.VITE_API_BASE_URL || "http://127.0.0.1:4000",
            VITE_FIREBASE_PROJECT_ID: "demo-digital-e-local",
            VITE_FIREBASE_API_KEY: "local-emulator-only",
            VITE_FIREBASE_AUTH_DOMAIN: "localhost",
            VITE_FIREBASE_STORAGE_BUCKET: "demo-digital-e-local.appspot.com",
            VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
            VITE_FIREBASE_APP_ID: "1:000000000000:web:retail-p0-test",
            VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
        },
    },
});
