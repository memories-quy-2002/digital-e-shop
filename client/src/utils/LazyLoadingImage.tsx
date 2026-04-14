import React, { useEffect, useRef, CSSProperties } from "react";

const supportsWebP = () => {
    if (typeof document === "undefined") return false;
    const canvas = document.createElement("canvas");
    if (!canvas.getContext) return false;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
};

const convertImageToWebP = (image: HTMLImageElement) => {
    try {
        const canvas = document.createElement("canvas");
        const targetWidth = Math.min(image.clientWidth || image.naturalWidth, image.naturalWidth);
        const targetHeight = Math.min(image.clientHeight || image.naturalHeight, image.naturalHeight);
        canvas.width = Math.max(1, targetWidth);
        canvas.height = Math.max(1, targetHeight);
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/webp", 0.75);
    } catch {
        return null;
    }
};

const LazyLoadImage = ({
    src,
    alt,
    style,
    eager = false,
    onError,
}: {
    src: string;
    alt: string;
    style?: CSSProperties;
    eager?: boolean;
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}) => {
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        const imageElement = imgRef.current;
        if (!imageElement) return;

        const setSrc = () => {
            if (imageElement.dataset.src) {
                imageElement.src = imageElement.dataset.src;
            }
        };

        const handleLoad = () => {
            if (!supportsWebP() || imageElement.dataset.webpConverted === "true") return;
            const currentSrc = imageElement.currentSrc || imageElement.src;
            if (!/\.(jpe?g|png)(\?|$)/i.test(currentSrc)) return;
            const webpDataUrl = convertImageToWebP(imageElement);
            if (webpDataUrl) {
                imageElement.dataset.webpConverted = "true";
                imageElement.src = webpDataUrl;
            }
        };

        imageElement.addEventListener("load", handleLoad);

        if (eager) {
            setSrc();
        } else {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting && imageElement) {
                            setSrc();
                            observer.unobserve(imageElement);
                        }
                    });
                },
                { threshold: 0.05 },
            );

            observer.observe(imageElement);
            return () => {
                observer.unobserve(imageElement);
                imageElement.removeEventListener("load", handleLoad);
            };
        }

        return () => {
            imageElement.removeEventListener("load", handleLoad);
        };
    }, [eager, src]);

    return (
        <img
            ref={imgRef}
            data-src={src}
            src={eager ? src : undefined}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            style={style}
            onError={onError}
        />
    );
};
export default LazyLoadImage;
