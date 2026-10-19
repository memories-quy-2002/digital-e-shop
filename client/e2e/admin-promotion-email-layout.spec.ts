import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures/retail-p0";

test("promotion preview and email runner keep readable responsive layouts", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const admin = {
        id: "admin-1", email: "admin@example.test", username: "Admin", first_name: "Digital", last_name: "Admin",
        role: "Admin", status: "Active", email_verified: true, created_at: "2026-01-01T00:00:00.000Z", last_login: "2026-01-01T00:00:00.000Z",
    };

    await page.addInitScript(({ selectedLocale, selectedTheme, selectedAdmin }) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(selectedLocale));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(selectedTheme));
        sessionStorage.setItem("userData", JSON.stringify(selectedAdmin));
    }, { selectedLocale: locale, selectedTheme: theme, selectedAdmin: admin });
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/users/me", (route) => route.fulfill({ json: { userData: admin } }));
    await page.route("**/api/promotions", (route) => route.fulfill({ json: { promotions: [] } }));
    await page.route("**/api/admin/email**", (route) => route.fulfill({ json: { messages: [], nextAfterId: null } }));
    await page.route("**/api/admin/operations/run", (route) => route.fulfill({ json: { claimed: 0, succeeded: 0, retried: 0, failed: 0, reviewRequired: 0, elapsedMs: 2 } }));

    await page.goto("/admin/promotions");
    const preview = page.locator(".admin__promotion-preview");
    await expect(preview).toBeVisible();
    const label = preview.locator("label");
    const input = preview.locator("input");
    const labelBox = await label.boundingBox();
    const inputBox = await input.boundingBox();
    expect(labelBox).not.toBeNull();
    expect(inputBox).not.toBeNull();
    if (testInfo.project.name.startsWith("mobile")) {
        expect(inputBox!.y).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height - 1);
    } else {
        expect(inputBox!.x).toBeGreaterThanOrEqual(labelBox!.x + labelBox!.width - 1);
    }
    await expect(preview.getByText(locale === "vi" ? "Giá trị giỏ hàng mẫu" : "Sample cart value")).toBeVisible();

    await page.goto("/admin/email-operations");
    const runner = page.locator(".operations__runner");
    await expect(runner).toBeVisible();
    await expect(page.getByRole("button", { name: locale === "vi" ? "Chạy vận hành" : "Run operations" })).toBeVisible();
    const runnerBox = await runner.boundingBox();
    const labelBoxEmail = await runner.locator("label").boundingBox();
    expect(runnerBox).not.toBeNull();
    expect(labelBoxEmail).not.toBeNull();
    expect(labelBoxEmail!.x).toBeLessThan(runnerBox!.x + runnerBox!.width / 2);
    await page.getByRole("button", { name: locale === "vi" ? "Chạy vận hành" : "Run operations" }).click();
    const summary = page.locator(".operations__runner-summary");
    await expect(summary).toContainText(locale === "vi" ? "Không có tác vụ nào đến hạn để xử lý." : "No due operations were found.");
    expect(await summary.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(128);
    expect(await summary.evaluate((element) => element.parentElement?.classList.contains("operations__runner"))).toBe(false);
    await expectNoHorizontalOverflow(page);
});
