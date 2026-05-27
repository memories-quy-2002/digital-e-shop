import React, { CSSProperties } from "react";
import productPlaceholder from "../assets/images/product_placeholder.jpg";
import LazyLoadImage from "./LazyLoadingImage";
import { PRODUCT_CARD_WIDTHS, getProductImageUrl, getResponsiveImageSource } from "./images";

export default function loadImage(
    imageUrl: string | null,
    productName: string,
    style?: CSSProperties,
    eager = false,
    sizes = "(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 768px) 50vw, 92vw",
) {
    if (!imageUrl) {
        return <img src={productPlaceholder} alt={productName} style={style} loading="lazy" decoding="async" />;
    }

    const imageSrc = getProductImageUrl(imageUrl);
    const responsiveSource = getResponsiveImageSource(imageSrc, {
        widths: PRODUCT_CARD_WIDTHS,
        sizes,
        fit: "fill",
    });

    const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.src = productPlaceholder;
    };

    return (
        <LazyLoadImage
            src={responsiveSource.src}
            srcSet={responsiveSource.srcSet}
            sizes={responsiveSource.sizes}
            alt={productName}
            style={style}
            eager={eager}
            onError={handleError}
        />
    );
}
