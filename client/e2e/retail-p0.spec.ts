import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, installRetailP0BrowserState } from "./fixtures/retail-p0";

const productId = Number(process.env.RETAIL_P0_PRODUCT_ID);

test("guest COD checkout displays a delivery quote and confirms an order", async ({ page }, testInfo) => {
    test.setTimeout(60000);
    expect(Number.isSafeInteger(productId) && productId > 0, "RETAIL_P0_PRODUCT_ID must name the parcel-ready fixture product").toBe(true);
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
    const checkoutName = locale === "vi" ? "Tiến hành thanh toán" : "Proceed to checkout";
    await page.getByRole("button", { name: checkoutName }).first().click();
    await page.getByRole("dialog").getByRole("button").last().click();
    await expect(page.locator("#checkout-email")).toBeVisible();

    await page.getByLabel(locale === "vi" ? "Tên người nhận" : "Recipient name").fill("Retail P0 Guest");
    await page.getByLabel(locale === "vi" ? "Số điện thoại người nhận" : "Recipient phone").fill("0901234567");
    await page.getByLabel(locale === "vi" ? "Địa chỉ đường" : "Street address").fill("1 Sandbox Street");
    await page.getByLabel(locale === "vi" ? "Tỉnh hoặc thành phố" : "Province or city").selectOption("1000001");
    await page.getByLabel(locale === "vi" ? "Phường hoặc xã" : "Ward").selectOption("1003646");
    await page.getByLabel(locale === "vi" ? "Dịch vụ giao hàng" : "Delivery service").selectOption("2");
    await page.locator("#checkout-email").fill(`retail-p0-${testInfo.project.name}@example.test`);
    const codOption = page.getByRole("radio", { name: locale === "vi" ? /Thanh toán khi nhận hàng/ : /Cash on delivery/ });
    await codOption.focus();
    await page.keyboard.press("Space");
    await expect(codOption).toBeChecked();
    await page.getByRole("button", { name: locale === "vi" ? "Tính phí giao hàng" : "Get delivery quote" }).click();
    await expect(page.getByRole("status").filter({ hasText: locale === "vi" ? "Phí mô phỏng" : "Sandbox estimate" })).toBeVisible();
    await expect(page.getByText(locale === "vi" ? "Tổng thanh toán" : "Total due", { exact: true }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: locale === "vi" ? "Đặt hàng" : "Place order" }).click();
    await expect(page).toHaveURL(/checkout-success/);
    await page.locator('input[aria-label*="token" i]').evaluateAll((inputs) => inputs.forEach((input) => {
        if (input instanceof HTMLInputElement) input.value = "REDACTED";
    }));
    await expect(page.getByRole("heading", { name: "Order confirmed", exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
});
