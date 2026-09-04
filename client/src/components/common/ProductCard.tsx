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

export type ProductCardProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    isWishlistPending?: boolean;
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const formatPrice = (value: number) => `$${value.toFixed(2)}`;

const ProductCard = ({
    product,
    uid,
    isWishlist,
    isWishlistPending = false,
    onToggleWishlist,
    onAddingCart,
}: ProductCardProps) => {
    const normalizedProduct = normalizeProduct(product);
    const hasSale =
        normalizedProduct.sale_price !== null &&
        normalizedProduct.sale_price > 0 &&
        normalizedProduct.sale_price < normalizedProduct.price;
    const activePrice = hasSale ? normalizedProduct.sale_price ?? normalizedProduct.price : normalizedProduct.price;
    const productPath = `/product?id=${normalizedProduct.id}`;
    const stockLabel = normalizedProduct.stock > 0 ? `${normalizedProduct.stock} in stock` : "Out of stock";

    return (
        <Card
            data-testid="product-card"
            className="group flex h-full min-h-[410px] flex-col overflow-hidden rounded-panel border-border bg-card p-2 transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:border-electric hover:shadow-[var(--de-shadow-sm)]"
        >
            <div className="relative">
                {hasSale ? (
                    <Badge variant="signal" className="absolute left-3 top-3 z-10 rounded-control">
                        Sale
                    </Badge>
                ) : normalizedProduct.stock > 0 ? (
                    <Badge variant="default" className="absolute left-3 top-3 z-10 rounded-control">
                        In stock
                    </Badge>
                ) : (
                    <Badge variant="danger" className="absolute left-3 top-3 z-10 rounded-control">
                        Out of stock
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
                    aria-label={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
                    aria-pressed={isWishlist}
                    disabled={isWishlistPending}
                    title={isWishlist ? "Remove from wishlist" : "Add to wishlist"}
                >
                    {isWishlist ? <HeartFillIcon size={17} color="currentColor" /> : <HeartIcon size={17} color="currentColor" />}
                </Button>

                <Link
                    to={productPath}
                    className="flex h-[210px] items-center justify-center overflow-hidden rounded-control border border-border bg-background-muted p-4 transition-colors duration-200 group-hover:border-electric"
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

            <CardContent className="flex flex-1 flex-col gap-2 px-2 pb-2 pt-4">
                <div className="flex items-center justify-between gap-2 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground">
                    <span className="truncate">{normalizedProduct.category || "Other"}</span>
                    <span className="shrink-0 rounded-control border border-border px-2 py-1 text-circuit">
                        {normalizedProduct.brand || "Digital-E"}
                    </span>
                </div>

                <Link
                    to={productPath}
                    className="line-clamp-2 min-h-11 font-display text-base font-bold leading-snug text-foreground transition-colors hover:text-electric focus-visible:text-electric"
                >
                    {normalizedProduct.name || "Unnamed product"}
                </Link>

                <div className="flex min-h-5 items-center justify-between gap-2 font-mono text-[0.65rem] text-success-strong">
                    <span>{stockLabel}</span>
                    {normalizedProduct.stock > 0 ? <span className="hidden text-[0.55rem] uppercase text-muted-foreground sm:inline">Ready to ship</span> : null}
                </div>

                <div className="flex min-h-7 items-baseline gap-2 font-mono">
                    {hasSale ? <span className="text-xs text-muted-foreground line-through">{formatPrice(normalizedProduct.price)}</span> : null}
                    <strong className={`text-lg font-bold ${hasSale ? "text-signal" : "text-foreground"}`}>
                        {formatPrice(activePrice)}
                    </strong>
                </div>

                <div className="mt-auto flex items-center gap-2 border-t border-border pt-3 font-mono text-[0.65rem] text-muted-foreground">
                    <span role="img" aria-label={`${normalizedProduct.rating.toFixed(1)} star rating`} className="flex items-center gap-0.5">
                        {ratingStar(normalizedProduct.rating, "#F4B860", 15)}
                    </span>
                    <span>{normalizedProduct.rating.toFixed(1)}</span>
                    <span className="ml-auto">{normalizedProduct.reviews} reviews</span>
                </div>

                <Button
                    type="button"
                    className="mt-1 w-full"
                    onClick={() => onAddingCart(uid, normalizedProduct.id)}
                    disabled={normalizedProduct.stock <= 0}
                >
                    <CartIcon size={16} color="currentColor" />
                    Add to cart
                </Button>
            </CardContent>
        </Card>
    );
};

export default memo(ProductCard);
