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

export const getResponsiveImageSource = (src: string, { sizes }: ResponsiveImageOptions): ResponsiveImageSource => {
    if (!src) {
        return { src: "" };
    }

    return { src, sizes };
};
