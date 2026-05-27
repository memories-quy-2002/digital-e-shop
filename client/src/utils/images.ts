export const PRODUCT_IMAGE_BASE_URL = "https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads";

export const PRODUCT_CARD_WIDTHS = [240, 320, 480, 640, 960];
export const PRODUCT_GALLERY_WIDTHS = [480, 720, 960, 1280, 1600];
export const HERO_IMAGE_WIDTHS = [640, 960, 1280, 1600, 1920];

type ImageTransformOptions = {
    width?: number;
    height?: number;
    fit?: "fill" | "fit" | "limit";
};

type ResponsiveImageOptions = ImageTransformOptions & {
    sizes: string;
    widths: number[];
};

type ResponsiveImageSource = {
    src: string;
    srcSet?: string;
    sizes?: string;
};

const getCloudinaryCloudName = () => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME?.trim();
    return cloudName || "";
};

const toAbsoluteImageUrl = (src: string) => {
    if (/^https?:\/\//i.test(src)) {
        return src;
    }

    if (typeof window === "undefined" || !src.startsWith("/")) {
        return src;
    }

    const { origin, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
        return src;
    }

    return `${origin}${src}`;
};

const buildCloudinaryFetchUrl = (src: string, options: ImageTransformOptions = {}) => {
    const cloudName = getCloudinaryCloudName();
    const absoluteSrc = toAbsoluteImageUrl(src);

    if (!cloudName || !/^https?:\/\//i.test(absoluteSrc)) {
        return src;
    }

    const widthTransform = options.width ? `w_${options.width}` : "w_auto";
    const heightTransform = options.height ? `,h_${options.height}` : "";
    const fitTransform = `,c_${options.fit || "fill"}`;
    const transform = `f_auto,q_auto,dpr_auto,${widthTransform}${heightTransform}${fitTransform}`;

    return `https://res.cloudinary.com/${cloudName}/image/fetch/${transform}/${encodeURIComponent(absoluteSrc)}`;
};

export const normalizeProductImageName = (name?: string | null) => {
    if (!name) return "";
    return name.replace(/\.jpg$/i, "");
};

export const getProductImageUrl = (imageName?: string | null) => {
    const normalized = normalizeProductImageName(imageName);
    return normalized ? `${PRODUCT_IMAGE_BASE_URL}/${normalized}.jpg` : "";
};

export const getResponsiveImageSource = (
    src: string,
    { sizes, widths, ...options }: ResponsiveImageOptions,
): ResponsiveImageSource => {
    if (!src) {
        return { src: "" };
    }

    const fallbackWidth = widths[Math.min(widths.length - 1, 2)] || widths[0];

    if (!getCloudinaryCloudName()) {
        return {
            src,
            sizes,
        };
    }

    return {
        src: buildCloudinaryFetchUrl(src, { ...options, width: fallbackWidth }),
        srcSet: widths.map((width) => `${buildCloudinaryFetchUrl(src, { ...options, width })} ${width}w`).join(", "),
        sizes,
    };
};
