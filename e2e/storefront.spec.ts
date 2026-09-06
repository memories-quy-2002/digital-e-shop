import { expect, test } from "@playwright/test";

test.describe("storefront smoke", () => {
    test("renders the storefront and opens the catalog", async ({ page }) => {
        await page.goto("/");

        await expect(page.locator("main.home")).toBeVisible();
        await expect(page.getByRole("heading", { name: /Premium laptops & monitors/i })).toBeVisible();
        await expect(page.getByRole("link", { name: /View all products/i })).toBeVisible();

        await page.getByRole("link", { name: /View all products/i }).click();

        await expect(page).toHaveURL(/\/shops(?:\?|$)/);
        await expect(page.getByTestId("shops__container")).toBeVisible();
    });
});
