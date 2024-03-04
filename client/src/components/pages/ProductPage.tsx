import React from "react";

interface Product {
	id: number;
	name: string;
	category: string;
	brand: string;
	rating: number;
	reviews: number;
	price: number;
	sale_price: number | null;
	image: string;
}

const ProductPage = () => {
	return <div>ProductPage</div>;
};

export default ProductPage;
