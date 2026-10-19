import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures/retail-p0";

test("admin audit log presents responsive themed filters and an empty state", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const admin = {
        id: "admin-1",
        email: "admin@example.test",
        username: "Admin",
        first_name: "Digital",
        last_name: "Admin",
        role: "Admin",
        status: "Active",
        email_verified: true,
        created_at: "2026-01-01T00:00:00.000Z",
        last_login: "2026-01-01T00:00:00.000Z",
    };

    await page.addInitScript(({ selectedLocale, selectedTheme, selectedAdmin }) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(selectedLocale));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(selectedTheme));
        sessionStorage.setItem("userData", JSON.stringify(selectedAdmin));
    }, { selectedLocale: locale, selectedTheme: theme, selectedAdmin: admin });
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/users/me", (route) => route.fulfill({ json: { userData: admin } }));
    await page.route("**/api/admin/audit**", (route) => route.fulfill({ json: {
        events: [],
        pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
    } }));

    await page.goto("/admin/audit");

    const searchLabel = locale === "vi" ? "Tìm kiếm sự kiện kiểm toán" : "Search audit events";
    const filterLabel = locale === "vi" ? "Lọc theo loại bản ghi" : "Filter by record type";
    await expect(page.getByRole("heading", { level: 1, name: locale === "vi" ? "Nhật ký kiểm toán" : "Audit log" })).toBeVisible();
    await expect(page.getByRole("searchbox", { name: searchLabel })).toBeVisible();
    await expect(page.getByLabel(filterLabel)).toBeVisible();
    await expect(page.getByText(locale === "vi" ? "Chưa có sự kiện kiểm toán" : "No audit events found")).toBeVisible();

    const filters = page.locator(".admin__audit__filters");
    await expect(filters).toHaveCSS("display", "grid");
    const filterColumnCount = await filters.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(filterColumnCount).toBe(testInfo.project.name.startsWith("mobile") ? 1 : 2);
    await expect(page.locator(".admin__audit__empty")).toHaveCSS(
        "background-color",
        theme === "dark" ? "rgb(32, 42, 47)" : "rgb(233, 231, 223)",
    );
    await expectNoHorizontalOverflow(page);
});
