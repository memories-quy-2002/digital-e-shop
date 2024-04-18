import { useEffect, useState } from "react";
import { IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import iphone from "../../assets/images/iphone.jpg";
import "../../styles/HomePage.scss";
import { Product } from "../../utils/interface";
import NavigationBar from "../common/NavigationBar";
import ProductItem from "../common/ProductItem";
import Layout from "../layout/Layout";

const cookies = new Cookies();

const HomePage = () => {
	const navigate = useNavigate();
	const [products, setProducts] = useState<Product[]>([]);
	const [categories, setCategories] = useState<string[]>([]);
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

	useEffect(() => {
		setCategories([
			...new Set(products.map((product) => product.category)),
		]);
	}, [products]);

	return (
		<Layout>
			<NavigationBar />
			<div className="home">
				<div className="home__hero">
					<div className="home__hero__overlap">
						<p className="home__hero__overlap__upto">
							<span className="home__hero__overlap__upto__wrapper">
								Up to 55% OFF
								<br />
							</span>
							<span
								className="home__hero__overlap__upto__wrapper"
								style={{ fontSize: "28px" }}
							>
								with the new devices
							</span>
						</p>
						<button
							type="button"
							className="home__hero__overlap__button"
							onClick={() => navigate("/")}
						>
							BUY NOW <IoArrowForward />
						</button>
					</div>
					<img
						className="home__hero__overlap__iphone"
						alt="Iphone"
						src={iphone}
					/>
				</div>
				{categories.map((category, id) => (
					<div className="home__product" key={id}>
						<div className="home__product__header">
							<h3 className="home__product__header__title">
								{category}
							</h3>
							<div>
								<a
									href={`${category.toLowerCase()}`}
									target="blank"
									style={{
										textDecoration: "none",
										fontSize: "20px",
									}}
								>
									View all <IoArrowForward />
								</a>
							</div>
						</div>

						<div className="home__product__menu">
							{products
								.filter(
									(product) => product.category === category
								)
								.map((product) => (
									<ProductItem
										key={product.id}
										product={product}
										uid={uid}
									/>
								))}
						</div>
					</div>
				))}
			</div>
		</Layout>
	);
};

export default HomePage;
