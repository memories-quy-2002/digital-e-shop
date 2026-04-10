import productPlaceholder from "../assets/images/product_placeholder.jpg";
import LazyLoadImage from "./LazyLoadingImage";

export default function loadImage(imageUrl: string | null, productName: string) {
    if (!imageUrl) {
        return <img src={productPlaceholder} alt={productName} />;
    } else {
        return (
            <LazyLoadImage
                src={`https://2txtqipejre57csy.public.blob.vercel-storage.com/uploads/${imageUrl}.jpg`}
                alt={productName}
            />
        );
    }
}
