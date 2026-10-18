import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./fixtures/retail-p0";

test("product detail hero prioritizes the image, price, stock and purchase actions", async ({ page }, testInfo) => {
    const locale = testInfo.project.metadata.locale as "en" | "vi";
    const theme = testInfo.project.metadata.theme as "light" | "dark";
    await page.addInitScript(({ selectedLocale, selectedTheme }) => {
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(selectedLocale));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(selectedTheme));
    }, { selectedLocale: locale, selectedTheme: theme });
    await page.route("**/api/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/products/42", (route) => route.fulfill({ json: { product: {
        id: 42,
        name: "Noise Cancelling Headphones",
        sku: "BOSE-NC-01",
        category: "Headphone",
        brand: "Bose",
        price: 1800000,
        sale_price: 1500000,
        rating: 4.7,
        reviews: 28,
        main_image: "",
        stock: 20,
        available_stock: 20,
        description: "Wireless noise cancelling headphones.",
        specifications: "",
    } } }));

    await page.goto("/product?id=42");
    await expect(page.getByRole("heading", { level: 1, name: "Noise Cancelling Headphones" })).toBeVisible();
    await expect(page.locator(".product-page__summary-price")).toBeVisible();
    await expect(page.locator(".product-page__summary-discount")).toContainText("-17%");
    await expect(page.locator(".product-page__summary-facts")).toBeVisible();
    await expect(page.getByRole("button", { name: locale === "vi" ? "Thêm vào giỏ" : "Add to cart" })).toBeVisible();
    const detailsSection = page.getByTestId("product-details-section");
    const reviewsSection = page.getByTestId("product-reviews-section");
    const recommendationsSection = page.getByTestId("product-recommendations-shell");
    await expect(detailsSection).toBeVisible();
    await expect(reviewsSection).toBeVisible();
    await expect(page.getByTestId("product-tabs")).toHaveCount(0);
    expect(await page.evaluate(() => {
        const details = document.querySelector('[data-testid="product-details-section"]');
        const reviews = document.querySelector('[data-testid="product-reviews-section"]');
        const recommendations = document.querySelector('[data-testid="product-recommendations-shell"]');
        return Boolean(
            details && reviews && recommendations &&
            (details.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING) &&
            (reviews.compareDocumentPosition(recommendations) & Node.DOCUMENT_POSITION_FOLLOWING),
        );
    })).toBeTruthy();
    const increaseQuantity = page.getByRole("button", { name: locale === "vi" ? "Tăng số lượng" : "Increase quantity" });
    await expect(increaseQuantity).toBeVisible();
    await increaseQuantity.click();
    await expect(page.getByRole("spinbutton", { name: locale === "vi" ? "Số lượng" : "Quantity" })).toHaveValue("2");

    const imageFrame = page.getByTestId("product-gallery-main");
    const frame = await imageFrame.boundingBox();
    expect(frame).not.toBeNull();
    const switchButton = page.getByRole("switch").first();
    const switchBounds = await switchButton.boundingBox();
    expect(switchBounds).not.toBeNull();
    expect(switchBounds!.width).toBe(52);
    expect(switchBounds!.height).toBe(44);

    const viewport = page.viewportSize();
    if (viewport && viewport.width >= 900) {
        const galleryBounds = await page.locator(".product-page__gallery").boundingBox();
        const summaryBounds = await page.locator(".product-page__summary").boundingBox();
        expect(galleryBounds).not.toBeNull();
        expect(summaryBounds).not.toBeNull();
        expect(Math.abs(galleryBounds!.height - summaryBounds!.height)).toBeLessThanOrEqual(1);
    } else {
        expect(frame!.width / frame!.height).toBeCloseTo(3 / 2, 1);
    }
    await expectNoHorizontalOverflow(page);
});
