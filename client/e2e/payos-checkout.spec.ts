import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, installRetailP0BrowserState } from "./fixtures/retail-p0";

const productId = Number(process.env.RETAIL_P0_PRODUCT_ID);

test("guest PayOS mock checkout confirms only after simulator success", async ({ page }, testInfo) => {
    test.setTimeout(60000);
    expect(Number.isSafeInteger(productId) && productId > 0, "RETAIL_P0_PRODUCT_ID must name the parcel-ready fixture product").toBe(true);
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const pageErrors: string[] = [];
    const serverErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
        if (response.status() >= 500) serverErrors.push(new URL(response.url()).pathname);
    });
    await installRetailP0BrowserState(page, productId, locale, testInfo.project.metadata.theme as "light" | "dark");

    await page.goto("/cart");
    await page.getByRole("button", { name: locale === "vi" ? "Tiến hành thanh toán" : "Proceed to checkout" }).first().click();
    await page.getByRole("dialog").getByRole("button").last().click();
    await expect(page.locator("#checkout-email")).toBeVisible();

    await page.getByLabel(locale === "vi" ? "Tên người nhận" : "Recipient name").fill("PayOS Sandbox Guest");
    await page.getByLabel(locale === "vi" ? "Số điện thoại người nhận" : "Recipient phone").fill("0901234567");
    await page.getByLabel(locale === "vi" ? "Địa chỉ đường" : "Street address").fill("1 Sandbox Street");
    await page.getByLabel(locale === "vi" ? "Tỉnh hoặc thành phố" : "Province or city").selectOption("1000001");
    await page.getByLabel(locale === "vi" ? "Phường hoặc xã" : "Ward").selectOption("1003646");
    await page.getByLabel(locale === "vi" ? "Dịch vụ giao hàng" : "Delivery service").selectOption("2");
    await page.locator("#checkout-email").fill(`payos-${testInfo.project.name}@example.test`);

    const payosOption = page.locator("#payment-payos");
    await payosOption.focus();
    await page.keyboard.press("Space");
    await expect(payosOption).toBeChecked();
    await page.getByRole("button", { name: locale === "vi" ? "Tính phí giao hàng" : "Get delivery quote" }).click();
    await expect(page.getByRole("status").filter({ hasText: locale === "vi" ? "Phí mô phỏng" : "Sandbox estimate" })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: locale === "vi" ? "Tiếp tục đến PayOS" : "Continue to PayOS" }).click();
    await expect(page).toHaveURL(/\/mock-payos-checkout\?/);
    await expect(page.getByRole("heading", { name: "Confirm your PayOS payment" })).toBeVisible();
    await expect(page.getByText(/No money will be transferred/)).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Simulate payment success" }).click();
    await expect(page).toHaveURL(/\/checkout-success\?payment_provider=payos&payment_attempt_id=/);
    await expect(page.getByRole("heading", { name: locale === "vi" ? "Đơn hàng đã được xác nhận" : "Order confirmed" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("status")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
    expect(serverErrors).toEqual([]);
});
