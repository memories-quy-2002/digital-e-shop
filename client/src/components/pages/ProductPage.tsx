import { useEffect, useState } from "react";
import axios from "../../api/axios";
import "../../styles/ProductPage.scss";
import { Product } from "../../utils/interface";
import NavigationBar from "../common/NavigationBar";
import RecommendedProduct from "../common/RecommendedProduct";
import Layout from "../layout/Layout";
import ErrorPage from "./ErrorPage";

const ProductPage = () => {
	const url = new URLSearchParams(window.location.search);
	const productId = url.get("id");
	const pid = productId !== null ? parseInt(productId) : 0;
	const [error, setError] = useState<string>("");
	const [products, setProducts] = useState<Product[]>([]);
	const [productDetail, setProductDetail] = useState<Product>({
		id: 0,
		name: "",
		category: "",
		price: 0,
		sale_price: 0,
		rating: 0,
		reviews: 0,
		warranty: 0,
		main_image: "",
		image_gallery: [],
		stock: 0,
		description: "",
		specifications: [],
	});

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

	useEffect(() => {
		const fetchProducts = async () => {
			try {
				const response = await axios.get("/api/products");
				if (response.status === 200) {
					setProducts(response.data.products);
					console.log(response.data.msg);
				}
			} catch (err) {
				console.error(err);
			}
		};

		fetchProducts();
	}, []);

	if (pid === 0) {
		return <ErrorPage error={error} />;
	}
	return (
		<Layout>
			<NavigationBar />
			<div className="product__container">
				<div className="product__container__detail">
					<div>{productDetail.name}</div>
					<div>${productDetail.price}</div>
					<div>{productDetail.description}</div>
				</div>
				<RecommendedProduct
					pid={productDetail.id}
					randomProducts={products
						.sort(() => Math.random() - 0.5)
						.slice(0, 5)}
				/>
			</div>
		</Layout>
	);
};

export default ProductPage;
