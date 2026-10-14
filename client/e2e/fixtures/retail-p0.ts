import type { Page } from "@playwright/test";

export const installRetailP0BrowserState = async (
    page: Page,
    productId: number,
    locale: "en" | "vi",
    theme: "light" | "dark",
) => {
    await page.addInitScript(({ id, language, colorScheme }) => {
        localStorage.setItem("digital-e:guest-cart:v1", JSON.stringify({ items: [{ productId: id, quantity: 1 }] }));
        localStorage.setItem("digital-e:locale:v1", JSON.stringify(language));
        localStorage.setItem("digital-e:color-scheme:v1", JSON.stringify(colorScheme));
    }, { id: productId, language: locale, colorScheme: theme });
};

export const expectNoHorizontalOverflow = async (page: Page) => {
    const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
    }));
    if (dimensions.document > dimensions.viewport + 1) {
        throw new Error(`Horizontal overflow: document ${dimensions.document}px exceeds viewport ${dimensions.viewport}px`);
    }
};
