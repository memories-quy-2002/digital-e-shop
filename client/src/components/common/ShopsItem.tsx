import React, { memo } from "react";
import { Product } from "../../utils/interface";
import ProductCard from "./ProductCard";

type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    isWishlistPending?: boolean;
    imageEager?: boolean;
    imageFetchPriority?: "high" | "low" | "auto";
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ShopsItem = ({ product, uid, isWishlist, isWishlistPending = false, imageEager = false, imageFetchPriority, onToggleWishlist, onAddingCart }: ProductProps) => {
    return (
        <ProductCard
            product={product}
            uid={uid}
            isWishlist={isWishlist}
            isWishlistPending={isWishlistPending}
            imageEager={imageEager}
            imageFetchPriority={imageFetchPriority}
            onToggleWishlist={onToggleWishlist}
            onAddingCart={onAddingCart}
        />
    );
};

export default memo(ShopsItem);
