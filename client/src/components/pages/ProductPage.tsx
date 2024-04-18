import React, { useEffect, useState } from "react";
import { Product } from "../../utils/interface";
import Layout from "../layout/Layout";
import NavigationBar from "../common/NavigationBar";
import axios from "../../api/axios";
import ErrorPage from "./ErrorPage";

const ProductPage = () => {
	const url = new URLSearchParams(window.location.search);
	const productId = url.get("id");
	const pid = productId !== null ? parseInt(productId) : 0;
	const [error, setError] = useState<string>("");

	const [productDetail, setProductDetail] = useState<Product>({
		id: 0,
		name: "",
		category: "",
		price: 0,
		sale_price: 0,
		rating: 0,
		reviews: 0,
		warranty: 0,
		image: "",
		image_gallery: [],
		stock: 0,
		description: "",
		specifications: [],
	});

	console.log(pid);

	useEffect(() => {
		const fetchProduct = async () => {
			try {
				const response = await axios.get(`/api/products/${pid}`);
				if (response.status === 200) {
					setProductDetail(response.data.product);
					console.log(response.data.msg);
				}
			} catch (err: any) {
				setError(err.response.data.msg);
			}
		};
		fetchProduct();
	}, [pid]);
	if (pid === 0) {
		return <ErrorPage error={error} />;
	}
	return (
		<Layout>
			<NavigationBar />
			<div>{productDetail.name}</div>
			<div>${productDetail.price}</div>
			<div>{productDetail.description}</div>
		</Layout>
	);
};

export default ProductPage;
