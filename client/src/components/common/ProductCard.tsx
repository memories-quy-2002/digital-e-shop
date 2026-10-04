import React, { memo } from "react";
import { Link } from "react-router-dom";
import { CartIcon, HeartFillIcon, HeartIcon } from "./Icons";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Product } from "../../utils/interface";
import loadImage from "../../utils/loadImage";
import { normalizeProduct } from "../../utils/product";
import { normalizeProductImageName } from "../../utils/images";
import ratingStar from "../../utils/ratingStar";
import { formatCurrency } from "../../utils/currency";
import { useT } from "../../hooks/useT";
import { useToast } from "../../context/ToastContext";
import { useComparison } from "../../context/ComparisonContext";

export type ProductCardProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    isWishlistPending?: boolean;
    imageEager?: boolean;
    imageFetchPriority?: "high" | "low" | "auto";
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ProductCard = ({
    product,
    uid,
    isWishlist,
    isWishlistPending = false,
    imageEager = false,
    imageFetchPriority,
    onToggleWishlist,
    onAddingCart,
}: ProductCardProps) => {
    const t = useT();
    const { addToast } = useToast();
    const { isSelected, toggle } = useComparison();
    const normalizedProduct = normalizeProduct(product);
    const hasSale =
        normalizedProduct.sale_price !== null &&
        normalizedProduct.sale_price > 0 &&
        normalizedProduct.sale_price < normalizedProduct.price;
    const activePrice = hasSale ? normalizedProduct.sale_price ?? normalizedProduct.price : normalizedProduct.price;
    const productPath = `/product?id=${normalizedProduct.id}`;
    const availableStock = normalizedProduct.available_stock ?? normalizedProduct.stock;
    const discountPercent = hasSale ? Math.round(((normalizedProduct.price - activePrice) / normalizedProduct.price) * 100) : 0;
    const stockLabel = availableStock > 0 ? t("product.stockIn", availableStock) : t("product.stockOut");
    const wishlistLabel = isWishlist ? t("product.savedToWishlist") : t("product.saveToWishlist");
    const isComparisonSelected = isSelected(normalizedProduct.id);
    const comparisonLabel = isComparisonSelected ? t("comparison.removeFromCompare") : t("comparison.addToCompare");

    const handleComparisonToggle = () => {
        const result = toggle(normalizedProduct.id, normalizedProduct.category);
        if (result === "category-mismatch") {
            addToast(t("comparison.categoryMismatchTitle"), t("comparison.categoryMismatchMessage"));
        } else if (result === "limit-reached") {
            addToast(t("comparison.limitTitle"), t("comparison.limitMessage"));
        }
    };

    return (
        <Card
            data-testid="product-card"
            className="product-card"
        >
            <div className="product-card__visual">
                {hasSale ? (
                    <Badge variant="signal" className="product-card__badge">
                        {t("product.discountBadge", discountPercent)}
                    </Badge>
                ) : availableStock > 0 ? (
                    <Badge variant="default" className="product-card__badge">
                        {t("product.stockBadge")}
                    </Badge>
                ) : (
                    <Badge variant="danger" className="product-card__badge">
                        {t("product.stockValueOut")}
                    </Badge>
                )}

                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`product-card__wishlist ${isWishlist ? "product-card__wishlist--saved" : ""}`}
                    onClick={() => onToggleWishlist(uid, normalizedProduct.id)}
                    aria-label={wishlistLabel}
                    aria-pressed={isWishlist}
                    disabled={isWishlistPending}
                    title={wishlistLabel}
                >
                    {isWishlist ? <HeartFillIcon size={17} color="currentColor" /> : <HeartIcon size={17} color="currentColor" />}
                </Button>

                <Link
                    to={productPath}
                    className="de-product-media de-product-media--catalog w-full max-w-none"
                    data-testid="product-card-image"
                    aria-label={`View ${normalizedProduct.name}`}
                >
                    {loadImage(normalizeProductImageName(normalizedProduct.main_image), normalizedProduct.name, {
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        display: "block",
                    }, imageEager, "(min-width: 1280px) 20vw, (min-width: 1024px) 28vw, (min-width: 600px) 45vw, (min-width: 360px) 46vw, 92vw", imageFetchPriority)}
                </Link>
            </div>

            <CardContent className="product-card__content">
                <div className="product-card__meta">
                    <span className="product-card__category">{normalizedProduct.category || t("product.categoryFallback")}</span>
                    <span className="product-card__brand">{normalizedProduct.brand || t("product.brandFallback")}</span>
                </div>

                <Link
                    to={productPath}
                    className="product-card__title"
                >
                    {normalizedProduct.name || "Unnamed product"}
                </Link>

                <p className="product-card__specs" title={normalizedProduct.specifications || undefined}>
                    {normalizedProduct.specifications}
                </p>

                <div className="product-card__rating" data-testid="product-card-rating">
                    <span role="img" aria-label={`${normalizedProduct.rating.toFixed(1)} ${t("product.ratingLabel")}`} className="product-card__rating-stars">
                        {ratingStar(normalizedProduct.rating, "var(--de-color-warning)", 15)}
                    </span>
                    <span className="product-card__rating-value">{normalizedProduct.rating.toFixed(1)}</span>
                    <span className="product-card__reviews">{t("product.reviewsCount", normalizedProduct.reviews)}</span>
                </div>

                <div className="product-card__price" data-testid="product-card-price">
                    <strong className="product-card__price-current">{formatCurrency(activePrice)}</strong>
                    {hasSale ? <span className="product-card__price-original">{formatCurrency(normalizedProduct.price)}</span> : null}
                </div>

                <div
                    className={`product-card__availability ${availableStock > 0 ? "product-card__availability--available" : "product-card__availability--unavailable"}`}
                    data-testid="product-card-stock"
                >
                    <span>{stockLabel}</span>
                </div>

                <Button
                    type="button"
                    variant="ghost"
                    className={`product-card__compare ${isComparisonSelected ? "product-card__compare--selected" : ""}`}
                    onClick={handleComparisonToggle}
                    aria-label={comparisonLabel}
                    aria-pressed={isComparisonSelected}
                >
                    {comparisonLabel}
                </Button>
                <Button
                    type="button"
                    className="product-card__add-to-cart"
                    aria-label={t("product.addToCart")}
                    onClick={() => onAddingCart(uid, normalizedProduct.id)}
                    disabled={availableStock <= 0}
                >
                    <CartIcon size={16} color="currentColor" />
                    <span className="product-card__cart-label">{t("product.addToCart")}</span>
                    <span className="product-card__cart-label--compact" aria-hidden="true">{t("product.addToCartShort")}</span>
                </Button>
            </CardContent>
        </Card>
    );
};

export default memo(ProductCard);
