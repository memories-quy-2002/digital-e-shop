import type { Product } from "../../types/product";

export function buildProductStructuredData(product: Product, pageUrl: string, imageUrl: string) {
    const price = product.sale_price !== null && product.sale_price < product.price
        ? product.sale_price
        : product.price;
    const stock = product.available_stock ?? product.stock;

    return {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.description || product.specifications || product.name,
        image: imageUrl ? [imageUrl] : undefined,
        sku: product.sku || undefined,
        mpn: product.manufacturerPartNumber || undefined,
        category: product.category || undefined,
        brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
        offers: {
            "@type": "Offer",
            url: pageUrl,
            priceCurrency: "VND",
            price: Math.round(price),
            availability: stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            itemCondition: "https://schema.org/NewCondition",
        },
        ...(product.reviews > 0 && product.rating > 0 ? {
            aggregateRating: {
                "@type": "AggregateRating",
                ratingValue: product.rating,
                reviewCount: product.reviews,
                bestRating: 5,
                worstRating: 1,
            },
        } : {}),
    };
}

export function serializeStructuredData(value: unknown): string {
    return JSON.stringify(value).replace(/</g, "\\u003c");
}
