export const PRODUCT_IMAGE_BASE_URL = "https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads";

export const PRODUCT_CARD_WIDTHS = [240, 320, 480, 640, 960];
export const PRODUCT_GALLERY_WIDTHS = [480, 720, 960, 1280, 1600];
export const HERO_IMAGE_WIDTHS = [640, 960, 1280, 1600, 1920];
export const PAGE_IMAGE_WIDTHS = [480, 720, 960, 1280];
export const THUMBNAIL_IMAGE_WIDTHS = [120, 180, 240, 320];

type ResponsiveImageOptions = {
    sizes: string;
    widths: number[];
    width?: number;
    height?: number;
    fit?: "fill" | "fit" | "limit";
};

type ResponsiveImageSource = {
    src: string;
    srcSet?: string;
    sizes?: string;
};

export const normalizeProductImageName = (name?: string | null) => {
    if (!name) return "";
    return name.replace(/\.jpg$/i, "");
};

export const getProductImageUrl = (imageName?: string | null) => {
    const normalized = normalizeProductImageName(imageName);
    return normalized ? `${PRODUCT_IMAGE_BASE_URL}/${normalized}.jpg` : "";
};

const appendWidthQuery = (src: string, width: number): string => {
    if (!src) {
        return src;
    }
    if (/^data:/i.test(src) || src.startsWith("blob:")) {
        return src;
    }
    const separator = src.includes("?") ? "&" : "?";
    return `${src}${separator}w=${width}`;
};

const isRemoteBlobUrl = (src: string): boolean => src.startsWith(PRODUCT_IMAGE_BASE_URL);

export const getResponsiveImageSource = (
    src: string,
    { sizes, widths }: ResponsiveImageOptions,
): ResponsiveImageSource => {
    if (!src) {
        return { src: "" };
    }

    if (!widths || widths.length === 0 || !isRemoteBlobUrl(src)) {
        return { src, sizes };
    }

    const sortedWidths = Array.from(new Set(widths)).sort((a, b) => a - b);
    const srcSet = sortedWidths.map((width) => `${appendWidthQuery(src, width)} ${width}w`).join(", ");

    return { src, srcSet, sizes };
};
