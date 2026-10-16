import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures/retail-p0";

const voucherCode = "LOY-0123456789ABCDEF0123";

test("customer can recover the loyalty page and claim a voucher accessibly", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const overview = {
        balancePoints: 500,
        history: [],
        vouchers: [],
        rewards: [{
            id: 7,
            description: "Member voucher",
            discountPercent: 15,
            minOrderValue: 100_000,
            pointsCost: 250,
            expiresAt: null,
            remainingUses: 1,
        }],
    };
    let overviewRequests = 0;
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.addInitScript(({ selectedLocale, selectedTheme }) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(selectedLocale));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(selectedTheme));
        sessionStorage.setItem("userData", JSON.stringify({
            id: "customer-1",
            email: "customer@example.test",
            username: "Customer",
            first_name: "Digital",
            last_name: "Customer",
            role: "Customer",
            email_verified: true,
            created_at: "2026-01-01T00:00:00.000Z",
            last_login: "2026-01-01T00:00:00.000Z",
        }));
    }, { selectedLocale: locale, selectedTheme: theme });

    await page.route("**/api/users/me", (route) => route.fulfill({ json: { userData: {
        id: "customer-1",
        email: "customer@example.test",
        username: "Customer",
        first_name: "Digital",
        last_name: "Customer",
        role: "Customer",
        email_verified: true,
        created_at: "2026-01-01T00:00:00.000Z",
        last_login: "2026-01-01T00:00:00.000Z",
    } } }));
    await page.route("**/api/cart/customer-1", (route) => route.fulfill({ json: { cartItems: [] } }));
    await page.route("**/api/loyalty/me", async (route) => {
        overviewRequests += 1;
        if (overviewRequests === 1) {
            await route.fulfill({ status: 503, json: { msg: "Temporary service failure" } });
            return;
        }
        await route.fulfill({ json: { loyalty: overview, msg: "Loyalty account retrieved successfully" } });
    });
    await page.route("**/api/loyalty/rewards/7/claim", (route) => route.fulfill({ json: {
        balancePoints: 250,
        voucher: {
            id: 31,
            code: voucherCode,
            status: "AVAILABLE",
            pointsCost: 250,
            discountPercent: 15,
            minOrderValue: 100_000,
            expiresAt: null,
            createdAt: "2026-10-16T00:00:00.000Z",
        },
    } }));

    await page.goto("/account/loyalty");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: locale === "vi" ? "Thử lại" : "Try again" }).click();

    await expect(page.getByRole("heading", { level: 2, name: locale === "vi" ? "500 điểm" : "500 points" })).toBeVisible();
    const claimButton = page.getByRole("button", { name: /250/ });
    let claimButtonFocused = false;
    for (let index = 0; index < 40 && !claimButtonFocused; index += 1) {
        await page.keyboard.press("Tab");
        claimButtonFocused = await claimButton.evaluate((element) => element === document.activeElement);
    }
    expect(claimButtonFocused).toBe(true);
    expect((await claimButton.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("status").filter({ hasText: voucherCode })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: locale === "vi" ? "250 điểm" : "250 points" })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(pageErrors).toEqual([]);
});
