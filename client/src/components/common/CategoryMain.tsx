import React from "react";
import { Product } from "../../utils/interface";
import ProductItem from "./ProductItem";

type CategoryMainProps = {
	products: Product[];
	uid: string;
};

const CategoryMain = ({ products, uid }: CategoryMainProps) => {
	
	return (
		<div>
			{products.map((product) => (
				<ProductItem key={product.id} product={product} uid={uid} isWishlist={false}/>
			))}
		</div>
	);
};

export default CategoryMain;
