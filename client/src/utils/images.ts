export const PRODUCT_IMAGE_BASE_URL = "https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads";

export const PRODUCT_CARD_WIDTHS = [240, 320, 480, 640, 960];
export const PRODUCT_GALLERY_WIDTHS = [480, 720, 960, 1280, 1600];
export const HERO_IMAGE_WIDTHS = [640, 960, 1280, 1600, 1920];
export const PAGE_IMAGE_WIDTHS = [480, 720, 960, 1280];
export const THUMBNAIL_IMAGE_WIDTHS = [120, 180, 240, 320];

const GENERATED_BLOB_WIDTHS = [320, 640, 960, 1280];
const OPTIMIZED_IMAGE_MARKER = "--de-width-";

type ResponsiveImageOptions = {
    sizes: string;
    widths: number[];
    width?: number;
    height?: number;
    fit?: "fill" | "fit" | "limit";
};

export type ResponsiveImageSource = {
    src: string;
    srcSet?: string;
    avifSrcSet?: string;
    sizes?: string;
};

export const normalizeProductImageName = (name?: string | null) => {
    if (!name) return "";
    return name.replace(/\.jpg$/i, "");
};

export const getProductImageUrl = (imageName?: string | null) => {
    if (imageName && /^https?:\/\//i.test(imageName)) {
        return imageName;
    }
    const normalized = normalizeProductImageName(imageName);
    if (!normalized) return "";
    if (new RegExp(`${OPTIMIZED_IMAGE_MARKER}\\d+$`, "i").test(normalized)) {
        return `${PRODUCT_IMAGE_BASE_URL}/${normalized}.webp`;
    }
    if (/\.(?:jpe?g|png|webp|avif)$/i.test(normalized)) {
        return `${PRODUCT_IMAGE_BASE_URL}/${normalized}`;
    }
    return `${PRODUCT_IMAGE_BASE_URL}/${normalized}.jpg`;
};

type OptimizedBlobImage = {
    pathPrefix: string;
    maxWidth: number;
};

const getOptimizedBlobImage = (src: string): OptimizedBlobImage | null => {
    try {
        const imageUrl = new URL(src);
        const blobBaseUrl = new URL(PRODUCT_IMAGE_BASE_URL);
        const basePath = blobBaseUrl.pathname.replace(/\/+$/, "");
        if (imageUrl.origin !== blobBaseUrl.origin || !imageUrl.pathname.startsWith(`${basePath}/`)) {
            return null;
        }

        const match = imageUrl.pathname.match(/^(.*)--de-width-(\d+)\.webp$/i);
        if (!match) return null;

        return { pathPrefix: match[1], maxWidth: Number(match[2]) };
    } catch {
        return null;
    }
};

const buildUnsplashSrcSet = (src: string, widths: number[]): string | undefined => {
    try {
        const sourceUrl = new URL(src);
        if (sourceUrl.protocol !== "https:" || sourceUrl.hostname !== "images.unsplash.com") {
            return undefined;
        }

        return widths
            .map((width) => {
                const candidate = new URL(sourceUrl);
                candidate.searchParams.set("w", String(width));
                if (!candidate.searchParams.has("auto")) candidate.searchParams.set("auto", "format");
                return `${candidate.toString()} ${width}w`;
            })
            .join(", ");
    } catch {
        return undefined;
    }
};

export const getResponsiveImageSource = (
    src: string,
    { sizes, widths }: ResponsiveImageOptions,
): ResponsiveImageSource => {
    if (!src) {
        return { src: "" };
    }

    if (!widths || widths.length === 0) {
        return { src, sizes };
    }

    const sortedWidths = Array.from(new Set(widths)).sort((a, b) => a - b);
    const optimizedBlob = getOptimizedBlobImage(src);
    if (optimizedBlob) {
        const availableWidths = [
            ...GENERATED_BLOB_WIDTHS.filter((width) => width < optimizedBlob.maxWidth),
            optimizedBlob.maxWidth,
        ];
        const makeSrcSet = (format: "webp" | "avif") =>
            availableWidths
                .map((width) => `${new URL(src).origin}${optimizedBlob.pathPrefix}${OPTIMIZED_IMAGE_MARKER}${width}.${format} ${width}w`)
                .join(", ");

        return {
            src,
            srcSet: makeSrcSet("webp"),
            avifSrcSet: makeSrcSet("avif"),
            sizes,
        };
    }

    const unsplashSrcSet = buildUnsplashSrcSet(src, sortedWidths);
    if (!unsplashSrcSet) return { src, sizes };

    return { src, srcSet: unsplashSrcSet, sizes };
};

export const setImageFallback = (imageElement: HTMLImageElement, fallbackSrc: string): void => {
    imageElement.parentElement?.querySelectorAll("source").forEach((source) => {
        source.removeAttribute("srcset");
        source.removeAttribute("sizes");
        source.removeAttribute("data-srcset");
        source.removeAttribute("data-sizes");
    });
    imageElement.removeAttribute("srcset");
    imageElement.removeAttribute("sizes");
    imageElement.removeAttribute("data-srcset");
    imageElement.removeAttribute("data-sizes");
    imageElement.src = fallbackSrc;
};
