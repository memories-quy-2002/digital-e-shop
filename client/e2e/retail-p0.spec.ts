import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, installRetailP0BrowserState } from "./fixtures/retail-p0";

const productId = Number(process.env.RETAIL_P0_PRODUCT_ID);

test("guest COD checkout displays internal road-distance pricing and confirms an order", async ({ page }, testInfo) => {
    test.setTimeout(60000);
    expect(Number.isSafeInteger(productId) && productId > 0, "RETAIL_P0_PRODUCT_ID must name the internal-delivery fixture product").toBe(true);
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
        if (response.status() >= 500) serverErrors.push(new URL(response.url()).pathname);
    });
    await installRetailP0BrowserState(page, productId, locale, theme);

    await page.goto("/cart");
    await page.getByRole("button", { name: /Proceed to checkout|Tiến hành thanh toán/i }).first().click();
    await page.getByRole("dialog").getByRole("button").last().click();
    await expect(page.locator("#checkout-email")).toBeVisible();

    const addressFields = page.locator(".shipping-quote__grid input");
    await addressFields.nth(0).fill("Retail P0 Guest");
    await addressFields.nth(1).fill("0901234567");
    await addressFields.nth(2).fill("1 Internal Delivery Street");
    await addressFields.nth(3).fill("Ho Chi Minh City");
    const mapCoordinates = page.locator(".delivery-map__coordinates input");
    await mapCoordinates.nth(0).fill("10.7769");
    await mapCoordinates.nth(1).fill("106.7009");
    await page.locator("#checkout-email").fill(`retail-p0-${testInfo.project.name}@example.test`);
    const codOption = page.getByRole("radio", { name: /Cash on delivery|Thanh toán khi nhận hàng/i });
    await codOption.focus();
    await page.keyboard.press("Space");
    await expect(codOption).toBeChecked();
    await page.locator(".shipping-quote").getByRole("button").click();
    await expect(page.locator(".shipping-quote__result")).toBeVisible();
    await expect(page.locator(".shipping-quote__result")).toContainText(locale === "vi" ? "Quãng đường đường bộ" : "Road distance");
    await expect(page.getByText(locale === "vi" ? "Tổng thanh toán" : "Total due", { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: /Place order|Đặt hàng/i }).click();
    await expect(page).toHaveURL(/checkout-success/);
    await page.locator('input[aria-label*="token" i]').evaluateAll((inputs) => inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) input.value = "REDACTED";
    }));
    await expect(page.getByRole("heading", { name: "Order confirmed", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
});
