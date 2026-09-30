import React, { CSSProperties } from "react";
import productPlaceholder from "../assets/images/product_placeholder.jpg";
import LazyLoadingImage from "./LazyLoadingImage";
import { PRODUCT_CARD_WIDTHS, getProductImageUrl, getResponsiveImageSource, setImageFallback } from "./images";

export default function loadImage(
    imageUrl: string | null,
    productName: string,
    style?: CSSProperties,
    eager = false,
    sizes = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 92vw",
    fetchPriority?: "high" | "low" | "auto",
) {
    if (!imageUrl) {
        const placeholderSource = getResponsiveImageSource(productPlaceholder, {
            widths: PRODUCT_CARD_WIDTHS,
            sizes,
            fit: "fill",
        });

        return (
            <img
                src={placeholderSource.src}
                srcSet={placeholderSource.srcSet}
                sizes={placeholderSource.sizes}
                alt={productName}
                style={style}
                loading={eager ? "eager" : "lazy"}
                decoding="async"
                fetchPriority={fetchPriority}
            />
        );
    }

    const imageSrc = getProductImageUrl(imageUrl);
    const responsiveSource = getResponsiveImageSource(imageSrc, {
        widths: PRODUCT_CARD_WIDTHS,
        sizes,
        fit: "fill",
    });

    const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        setImageFallback(e.currentTarget, getResponsiveImageSource(productPlaceholder, {
            widths: PRODUCT_CARD_WIDTHS,
            sizes,
            fit: "fill",
        }).src);
    };

    return (
        <LazyLoadingImage
            src={responsiveSource.src}
            srcSet={responsiveSource.srcSet}
            avifSrcSet={responsiveSource.avifSrcSet}
            sizes={responsiveSource.sizes}
            alt={productName}
            style={style}
            eager={eager}
            fetchPriority={fetchPriority}
            onError={handleError}
        />
    );
}
