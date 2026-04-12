import productPlaceholder from "../assets/images/product_placeholder.jpg";
import LazyLoadImage from "./LazyLoadingImage";

export default function loadImage(imageUrl: string | null, productName: string, style?: React.CSSProperties) {
    if (!imageUrl) {
        return <img src={productPlaceholder} alt={productName} style={style} />;
    }

    const imageSrc = `https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`;

    return (
        <LazyLoadImage
            src={imageSrc}
            alt={productName}
            style={style}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                e.currentTarget.src = productPlaceholder;
            }}
        />
    );
}
