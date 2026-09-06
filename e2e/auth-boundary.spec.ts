import { expect, test, type Page } from "@playwright/test";

const apiBaseUrl = process.env.E2E_API_URL || "http://localhost:4000";

async function assertAuthPageHasNoRoleSelector(page: Page, path: string, formName: string) {
    await page.goto(path);
    await expect(page.locator(`form[aria-label="${formName}"]`)).toBeVisible();
    await expect(page.getByText(/(?:Login|Signup) as/i)).toHaveCount(0);
    await expect(page.locator('[name="role"], [name="userRole"], select')).toHaveCount(0);
}

test.describe("auth boundary", () => {
    test("does not expose a client role selector on login or signup", async ({ page }) => {
        await assertAuthPageHasNoRoleSelector(page, "/login", "login-form");
        await assertAuthPageHasNoRoleSelector(page, "/signup", "signup-form");
    });

    test("rejects role forgery at the API boundary", async ({ request }) => {
        let registerResponse;
        let loginResponse;
        try {
            registerResponse = await request.post(`${apiBaseUrl}/api/users/register`, {
                data: {
                    idToken: "e2e-role-boundary-token",
                    user: { username: "e2e-role-attacker", role: "Admin" },
                },
            });
            loginResponse = await request.post(`${apiBaseUrl}/api/users/login`, {
                data: { idToken: "e2e-role-boundary-token", role: "Admin" },
            });
        } catch (error) {
            throw new Error(`API server is not available at ${apiBaseUrl}: ${String(error)}`, { cause: error });
        }

        expect(registerResponse.status()).toBe(400);
        expect(loginResponse.status()).toBe(400);
    });
});
