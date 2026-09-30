import React, { useEffect, useRef, CSSProperties } from "react";

const LazyLoadingImage = ({
    src,
    alt,
    style,
    eager = false,
    onError,
    srcSet,
    avifSrcSet,
    sizes,
    fetchPriority,
    className,
    width,
    height,
}: {
    src: string;
    alt: string;
    style?: CSSProperties;
    eager?: boolean;
    onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
    srcSet?: string;
    avifSrcSet?: string;
    sizes?: string;
    fetchPriority?: "high" | "low" | "auto";
    className?: string;
    width?: number;
    height?: number;
}) => {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const avifSourceRef = useRef<HTMLSourceElement | null>(null);

    useEffect(() => {
        const imageElement = imgRef.current;
        if (!imageElement) return;

        const setSrc = () => {
            const avifSource = avifSourceRef.current;
            if (avifSource?.dataset.sizes) {
                avifSource.sizes = avifSource.dataset.sizes;
            }
            if (avifSource?.dataset.srcset) {
                avifSource.srcset = avifSource.dataset.srcset;
            }
            if (imageElement.dataset.sizes) {
                imageElement.sizes = imageElement.dataset.sizes;
            }
            if (imageElement.dataset.srcset) {
                imageElement.srcset = imageElement.dataset.srcset;
            }
            if (imageElement.dataset.src) {
                imageElement.src = imageElement.dataset.src;
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
    }, [avifSrcSet, eager, sizes, src, srcSet]);

    const image = (
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
            className={className}
            width={width}
            height={height}
            style={style}
            onError={onError}
        />
    );

    if (!avifSrcSet) return image;

    return (
        <picture style={{ display: "contents" }}>
            <source
                ref={avifSourceRef}
                type="image/avif"
                data-srcset={avifSrcSet}
                data-sizes={sizes}
                srcSet={eager ? avifSrcSet : undefined}
                sizes={eager ? sizes : undefined}
            />
            {image}
        </picture>
    );
};
export default LazyLoadingImage;
