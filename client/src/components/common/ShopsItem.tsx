import React, { memo } from "react";
import { Product } from "../../utils/interface";
import ProductCard from "./ProductCard";

type ProductProps = {
    product: Product;
    uid: string;
    isWishlist: boolean;
    isWishlistPending?: boolean;
    onToggleWishlist: (user_id: string, product_id: number) => void;
    onAddingCart: (user_id: string, product_id: number) => void;
};

const ShopsItem = ({ product, uid, isWishlist, isWishlistPending = false, onToggleWishlist, onAddingCart }: ProductProps) => {
    return (
        <ProductCard
            product={product}
            uid={uid}
            isWishlist={isWishlist}
            isWishlistPending={isWishlistPending}
            onToggleWishlist={onToggleWishlist}
            onAddingCart={onAddingCart}
        />
    );
};

export default memo(ShopsItem);
