import React, { useEffect, useRef, CSSProperties } from "react";

const LazyLoadImage = ({
    src,
    alt,
    style,
    eager = false,
    onError,
    srcSet,
    sizes,
    fetchPriority,
}: {
    src: string;
    alt: string;
    style?: CSSProperties;
    eager?: boolean;
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    srcSet?: string;
    sizes?: string;
    fetchPriority?: "high" | "low" | "auto";
}) => {
    const imgRef = useRef<HTMLImageElement | null>(null);

    useEffect(() => {
        const imageElement = imgRef.current;
        if (!imageElement) return;

        const setSrc = () => {
            if (imageElement.dataset.src) {
                imageElement.src = imageElement.dataset.src;
            }
            if (imageElement.dataset.srcset) {
                imageElement.srcset = imageElement.dataset.srcset;
            }
            if (imageElement.dataset.sizes) {
                imageElement.sizes = imageElement.dataset.sizes;
            }
        };

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
            };
        }
    }, [eager, sizes, src, srcSet]);

    return (
        <img
            ref={imgRef}
            data-src={src}
            data-srcset={srcSet}
            data-sizes={sizes}
            src={eager ? src : undefined}
            srcSet={eager ? srcSet : undefined}
            sizes={eager ? sizes : undefined}
            alt={alt}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={fetchPriority}
            style={style}
            onError={onError}
        />
    );
};
export default LazyLoadImage;
