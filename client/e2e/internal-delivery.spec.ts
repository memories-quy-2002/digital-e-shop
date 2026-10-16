import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures/retail-p0";

declare global {
    interface Window {
        __deliveryGeoCalls: number;
    }
}

type Role = "Admin" | "DeliveryStaff";

const createUser = (role: Role) => ({
    id: role === "Admin" ? "admin-1" : "driver-1",
    email: `${role.toLowerCase()}@example.test`,
    username: role,
    first_name: role === "Admin" ? "Digital" : "Lan",
    last_name: role === "Admin" ? "Admin" : "Driver",
    role,
    status: "Active",
    email_verified: true,
    created_at: "2026-01-01T00:00:00.000Z",
    last_login: "2026-01-01T00:00:00.000Z",
});

const installBrowserState = async (
    page: Page,
    role: Role | null,
    locale: "en" | "vi",
    theme: "light" | "dark",
) => {
    const user = role ? createUser(role) : null;
    await page.addInitScript(({ selectedUser, selectedLocale, selectedTheme }) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(selectedLocale));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(selectedTheme));
        if (selectedUser) sessionStorage.setItem("userData", JSON.stringify(selectedUser));
        Object.defineProperty(window, "__deliveryGeoCalls", { value: 0, writable: true });
        Object.defineProperty(navigator, "geolocation", {
            configurable: true,
            value: {
                getCurrentPosition: () => { window.__deliveryGeoCalls += 1; },
                watchPosition: () => { window.__deliveryGeoCalls += 1; return 1; },
                clearWatch: () => undefined,
            },
        });
    }, { selectedUser: user, selectedLocale: locale, selectedTheme: theme });
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/users/me", (route) => route.fulfill({ json: { userData: user } }));
};

const expectNoDeviceLocation = async (page: Page) => {
    expect(await page.evaluate(() => window.__deliveryGeoCalls)).toBe(0);
};

test("admin configures the store pin and approved delivery settings", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const savedPayloads: unknown[] = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await installBrowserState(page, "Admin", locale, theme);

    await page.route("**/tiles.example.test/**", (route) => route.abort());
    await page.route("**/api/admin/delivery/settings", async (route) => {
        if (route.request().method() === "PUT") {
            const payload = route.request().postDataJSON();
            savedPayloads.push(payload);
            await route.fulfill({ json: { settings: { ...payload, version: 2 } } });
            return;
        }
        await route.fulfill({ json: {
            settings: {
                storeAddress: "Digital-E Store, Ho Chi Minh City",
                storeLatitude: 10.7769,
                storeLongitude: 106.7009,
                fee5To20Vnd: 25000,
                feeOver20Vnd: 50000,
                routingEndpoint: "https://router.example.test",
                tileUrl: "https://tiles.example.test/{z}/{x}/{y}.png",
                tileAttribution: "© Approved map provider",
                version: 1,
            },
            allowedRoutingEndpoints: ["https://router.example.test"],
            allowedTileUrls: ["https://tiles.example.test/{z}/{x}/{y}.png"],
        } });
    });

    await page.goto("/admin/delivery/settings");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const latitude = page.getByLabel(locale === "vi" ? "Vĩ độ" : "Latitude");
    const longitude = page.getByLabel(locale === "vi" ? "Kinh độ" : "Longitude");
    await latitude.focus();
    await page.keyboard.press("Tab");
    expect(await longitude.evaluate((element) => element === document.activeElement)).toBe(true);
    await page.getByLabel(locale === "vi" ? "Địa chỉ cửa hàng" : "Store address").fill("Digital-E District 1 store");
    await latitude.fill("10.7800");
    await longitude.fill("106.6900");
    await page.getByLabel(locale === "vi" ? "Phí từ 5 km đến 20 km (VND)" : "Fee from 5 km to 20 km (VND)").fill("30000");
    await page.getByLabel(locale === "vi" ? "Phí trên 20 km (VND)" : "Fee over 20 km (VND)").fill("60000");
    await page.getByRole("button", { name: locale === "vi" ? "Lưu cài đặt giao hàng" : "Save delivery settings" }).click();

    await expect(page.getByRole("status").filter({ hasText: locale === "vi" ? "Đã lưu cài đặt giao hàng." : "Delivery settings saved." })).toBeVisible();
    expect(savedPayloads).toHaveLength(1);
    expect(savedPayloads[0]).toMatchObject({
        storeAddress: "Digital-E District 1 store",
        storeLatitude: 10.78,
        storeLongitude: 106.69,
        fee5To20Vnd: 30000,
        feeOver20Vnd: 60000,
    });
    await expectNoHorizontalOverflow(page);
    await expectNoDeviceLocation(page);
    expect(pageErrors).toEqual([]);
});

test("admin assigns an internal order with Vietnam local schedule", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const savedAssignments: Array<Record<string, unknown>> = [];
    const order = {
        orderId: 42,
        createdAt: "2026-10-15T10:00:00.000Z",
        customerName: "Mai Nguyen",
        destination: {
            recipientName: "Mai Nguyen",
            recipientPhone: "0901234567",
            addressLine: "1 Main Street",
            city: "Ho Chi Minh City",
            country: "VN",
            latitude: 10.78,
            longitude: 106.69,
        },
        paymentMethod: "cash",
        paymentStatus: "PENDING",
        codAmountVnd: 750000,
        items: [{ productName: "Graphics card", sku: "GPU-1", quantity: 1, unitPriceVnd: 750000, totalPriceVnd: 750000 }],
        currentAssignment: null,
    };
    const assignment = {
        id: 9,
        orderId: 42,
        employeeId: "driver-1",
        employeeName: "Lan Driver",
        scheduledStartAt: "2099-10-16T10:00",
        scheduledEndAt: "2099-10-16T12:00",
        status: "ASSIGNED",
        failureReason: null,
        events: [],
    };
    await installBrowserState(page, "Admin", locale, theme);
    await page.route("**/api/admin/delivery/assignable-orders", (route) => route.fulfill({ json: { orders: [order] } }));
    await page.route("**/api/admin/delivery/staff", (route) => route.fulfill({ json: { staff: [{ id: "driver-1", name: "Lan Driver" }] } }));
    await page.route("**/api/admin/delivery/orders/42", (route) => route.fulfill({ json: { assignments: savedAssignments.length ? [assignment] : [] } }));
    await page.route("**/api/admin/delivery/orders/42/assignments", async (route) => {
        savedAssignments.push(route.request().postDataJSON() as Record<string, unknown>);
        await route.fulfill({ json: assignment });
    });

    await page.goto("/admin/fulfillment");
    await expect(page.getByRole("heading", { name: locale === "vi" ? "Phân công giao hàng" : "Delivery assignments" })).toBeVisible();
    await expect(page.getByText("Graphics card")).toBeVisible();
    await page.getByLabel(locale === "vi" ? "Nhân viên giao hàng" : "Delivery staff").selectOption("driver-1");
    await page.getByLabel(locale === "vi" ? "Giờ bắt đầu" : "Scheduled start").fill("2099-10-16T10:00");
    await page.getByLabel(locale === "vi" ? "Giờ kết thúc" : "Scheduled end").fill("2099-10-16T12:00");
    await page.getByRole("button", { name: locale === "vi" ? "Phân công giao hàng" : "Assign delivery" }).last().click();

    await expect(page.getByRole("status").filter({ hasText: locale === "vi" ? "Đã lưu phân công giao hàng." : "Delivery assignment saved." })).toBeVisible();
    expect(savedAssignments).toEqual([{
        employeeId: "driver-1",
        scheduledStartAt: "2099-10-16T10:00",
        scheduledEndAt: "2099-10-16T12:00",
    }]);
    await expectNoHorizontalOverflow(page);
    await expectNoDeviceLocation(page);
});

test("delivery staff records delivery and guest sees the public status", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    const statusChanges: string[] = [];
    const start = "2026-10-16T10:00:00.000Z";
    const end = "2026-10-16T12:00:00.000Z";
    const assignment = (status: "ASSIGNED" | "OUT_FOR_DELIVERY" | "DELIVERED") => ({
        id: 9,
        orderId: 42,
        employeeId: "driver-1",
        employeeName: "Lan Driver",
        scheduledStartAt: start,
        scheduledEndAt: end,
        status,
        failureReason: null,
        events: [{ id: 11, status, actorId: "driver-1", publicNote: null, createdAt: start }],
        order: {
            destination: { recipientName: "Mai Nguyen", recipientPhone: "0901234567", addressLine: "1 Main Street", city: "Ho Chi Minh City", country: "VN", latitude: 10.78, longitude: 106.69 },
            paymentMethod: "cash",
            codAmountVnd: 750000,
            items: [{ productName: "Graphics card", sku: "GPU-1", quantity: 1, unitPriceVnd: 750000, totalPriceVnd: 750000 }],
        },
    });
    await installBrowserState(page, "DeliveryStaff", locale, theme);
    await page.route("**/api/delivery/staff/assignments", (route) => route.fulfill({ json: { assignments: [assignment(statusChanges.at(-1) === "DELIVERED" ? "DELIVERED" : "ASSIGNED")] } }));
    await page.route("**/api/delivery/staff/assignments/9/status", async (route) => {
        const status = String((route.request().postDataJSON() as { status: string }).status);
        statusChanges.push(status);
        await route.fulfill({ json: assignment(status as "OUT_FOR_DELIVERY" | "DELIVERED") });
    });
    await page.route("**/api/orders/guest/lookup", (route) => route.fulfill({ json: { order: {
        id: 42,
        date_added: start,
        guest_email: "mai@example.test",
        guest_name: "Mai Nguyen",
        guest_phone: "0901234567",
        status: 1,
        total_price: 750000,
        discount: 0,
        shipping_address: JSON.stringify({ address: "1 Main Street", city: "Ho Chi Minh City", country: "VN" }),
        payment_method: "cash",
        items: [{ productId: 1, productName: "Graphics card", quantity: 1, totalPrice: 750000 }],
    } } }));
    await page.route("**/api/shipping/guest/shipment", async (route) => {
        expect(route.request().postDataJSON()).toEqual({ orderId: 42, guestOrderToken: "private-guest-token" });
        await route.fulfill({ json: { shipment: {
            orderId: 42,
            state: "READY_TO_SHIP",
            delivery: {
                id: 9,
                orderId: 42,
                employeeName: "Lan Driver",
                scheduledStartAt: start,
                scheduledEndAt: end,
                status: "DELIVERED",
                events: [{ id: 11, status: "DELIVERED", publicNote: null, createdAt: end }],
            },
        } } });
    });

    await page.goto("/delivery/assignments");
    await page.getByRole("button", { name: locale === "vi" ? "Bắt đầu giao" : "Start delivery" }).click();
    await page.getByRole("button", { name: locale === "vi" ? "Đánh dấu đã giao" : "Mark delivered" }).click();
    await expect(page.getByRole("status").filter({ hasText: locale === "vi" ? "Đã đánh dấu đơn hàng được giao." : "Order marked as delivered." })).toBeVisible();
    expect(statusChanges).toEqual(["OUT_FOR_DELIVERY", "DELIVERED"]);

    await page.goto("/guest-order?orderId=42");
    await page.getByLabel(locale === "vi" ? "Mã truy cập" : "Access token").fill("private-guest-token");
    await page.getByRole("button", { name: locale === "vi" ? /Tra cứu đơn hàng/ : /Find order/ }).click();
    await expect(page.getByRole("heading", { name: "Mai Nguyen" })).toBeVisible();
    await expect(page.getByText("Lan Driver")).toBeVisible();
    await expect(page.getByText(locale === "vi" ? "Đã giao" : "Delivered").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoDeviceLocation(page);
});
