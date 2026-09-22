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
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ProductCard = ({
    product,
    uid,
    isWishlist,
    isWishlistPending = false,
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
            className="product-card group flex h-full min-h-[410px] flex-col overflow-hidden rounded-panel border-border bg-card p-2 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-electric hover:shadow-[var(--de-shadow-sm)]"
        >
            <div className="relative">
                {hasSale ? (
                    <Badge variant="signal" className="absolute left-3 top-3 z-10 rounded-control">
                        {t("product.discountBadge", discountPercent)}
                    </Badge>
                ) : availableStock > 0 ? (
                    <Badge variant="default" className="absolute left-3 top-3 z-10 rounded-control">
                        {t("product.stockBadge")}
                    </Badge>
                ) : (
                    <Badge variant="danger" className="absolute left-3 top-3 z-10 rounded-control">
                        {t("product.stockValueOut")}
                    </Badge>
                )}

                <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className={`absolute right-3 top-3 z-10 bg-card/95 ${
                        isWishlist ? "border-signal bg-signal text-primary-foreground" : "text-muted-foreground"
                    }`}
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
                    })}
                </Link>
            </div>

            <CardContent className="product-card__content flex flex-1 flex-col gap-2 px-2 pb-2 pt-4">
                <div className="product-card__meta">
                    <span className="product-card__category">{normalizedProduct.category || t("product.categoryFallback")}</span>
                    <span className="product-card__brand">{normalizedProduct.brand || t("product.brandFallback")}</span>
                </div>

                <Link
                    to={productPath}
                    className="product-card__title font-display font-bold text-foreground transition-colors hover:text-electric focus-visible:text-electric"
                >
                    {normalizedProduct.name || "Unnamed product"}
                </Link>

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
                    variant={isComparisonSelected ? "secondary" : "outline"}
                    className={`w-full whitespace-nowrap ${isComparisonSelected ? "border-electric text-electric" : ""}`}
                    onClick={handleComparisonToggle}
                    aria-label={comparisonLabel}
                    aria-pressed={isComparisonSelected}
                >
                    {comparisonLabel}
                </Button>
                <Button
                    type="button"
                    className="product-card__add-to-cart mt-auto w-full"
                    onClick={() => onAddingCart(uid, normalizedProduct.id)}
                    disabled={availableStock <= 0}
                >
                    <CartIcon size={16} color="currentColor" />
                    {t("product.addToCart")}
                </Button>
            </CardContent>
        </Card>
    );
};

export default memo(ProductCard);
