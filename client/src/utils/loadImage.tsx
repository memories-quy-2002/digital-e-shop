import React, { CSSProperties } from "react";
import productPlaceholder from "../assets/images/product_placeholder.jpg";
import LazyLoadImage from "./LazyLoadingImage";

export default function loadImage(imageUrl: string | null, productName: string, style?: CSSProperties, eager = false) {
    if (!imageUrl) {
        return <img src={productPlaceholder} alt={productName} style={style} loading="lazy" decoding="async" />;
    }

    const imageSrc = `https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`;

    const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
        e.currentTarget.src = productPlaceholder;
    };

    return <LazyLoadImage src={imageSrc} alt={productName} style={style} eager={eager} onError={handleError} />;
}
