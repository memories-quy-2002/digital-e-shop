import type { Translator } from "../hooks/useT";

const PRODUCT_CATEGORY_KEYS: Record<string, string> = {
    television: "television",
    laptop: "laptop",
    desktop: "desktop",
    smartphone: "smartphone",
    appliance: "appliance",
    speaker: "speaker",
    "home theater system": "homeTheaterSystem",
    console: "console",
    "graphics card": "graphicsCard",
    other: "other",
    headphone: "headphone",
    pc: "pc",
    camera: "camera",
    application: "application",
    phone: "phone",
    monitor: "monitor",
    smartwatch: "smartwatch",
    "smart home": "smartHome",
    accessory: "accessory",
    accessories: "accessories",
    components: "components",
    gpu: "gpu",
};

export const getProductCategoryLabel = (category: string, t: Translator) => {
    const normalizedCategory = category.trim().toLowerCase();
    const translationKey = PRODUCT_CATEGORY_KEYS[normalizedCategory];

    return translationKey ? t("product.categories." + translationKey) : category;
};
