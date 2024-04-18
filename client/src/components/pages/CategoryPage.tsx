import React, { useEffect, useState } from "react";
import Layout from "../layout/Layout";
import NavigationBar from "../common/NavigationBar";
import CategoryFilter from "../common/CategoryFilter";
import CategoryMain from "../common/CategoryMain";
import { Product } from "../../utils/interface";
import axios from "../../api/axios";
import Cookies from "universal-cookie";

type CategoryProps = {
	category: string;
};

const cookies = new Cookies();

const CategoryPage = ({ category }: CategoryProps) => {
	const [products, setProducts] = useState<Product[]>([]);
	const uid =
		cookies.get("rememberMe")?.uid ||
		(sessionStorage["rememberMe"]
			? JSON.parse(sessionStorage["rememberMe"]).uid
			: "");
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

	return (
		<Layout>
			<NavigationBar />
			<div>{category}</div>
			<div>
				<CategoryFilter />
				<div>
					<CategoryMain products={products} uid={uid} />
				</div>
			</div>
		</Layout>
	);
};

export default CategoryPage;
