import { useEffect, useState } from "react";
import { BsHeart } from "react-icons/bs";
import { IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import iphone from "../../assets/images/iphone.jpg";
import "../../styles/HomePage.scss";
import ratingStar from "../../utils/ratingStar";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";

const cookies = new Cookies();
interface Product {
	id: number;
	name: string;
	category: string;
	price: number;
	sale_price: number;
	rating: number;
	image: string;
}

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

	const onAddingWishlist = async (user_id: string, product_id: number) => {
		if (uid === "") {
			navigate("/login");
		}
		try {
			const response = await axios.post("/api/wishlist/", {
				uid: user_id,
				pid: product_id,
			});
			if (response.status === 200) {
				console.log(response.data.msg);
			}
		} catch (err) {
			throw err;
		}
	};

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
									<div
										className="home__product__menu__item"
										key={product.id}
									>
										<div
											className="home__product__menu__item__image"
											onClick={() => navigate(`/product`)}
										>
											<img
												src={
													product.image
														? require(`../../assets/images/${product.image}.jpg`)
														: require(`../../assets/images/product_placeholder.jpg`)
												}
												alt="Empty"
											/>
										</div>

										<div className="home__product__menu__item__wishlist">
											0
										</div>

										<div
											className="home__product__menu__item__like"
											onClick={() =>
												onAddingWishlist(
													uid,
													product.id
												)
											}
										>
											<BsHeart size={24} />
										</div>

										<p
											style={{
												textAlign: "center",
												fontWeight: "bold",
												color: "#939393",
											}}
										>
											{product.category}
										</p>
										<p
											style={{
												textAlign: "center",
												fontWeight: "bold",
												fontSize: "20px",
												height: "40px",
											}}
										>
											{product.name}
										</p>
										<p
											style={{
												textAlign: "center",
												fontWeight: "bold",
												fontSize: "20px",
												color: "red",
											}}
										>
											${product.price}
										</p>
										<div
											style={{
												display: "flex",
												flexDirection: "row",
												justifyContent: "space-between",
												padding: "1rem 1.5rem",
											}}
										>
											<div
												style={{
													width: "240px",
													display: "flex",
													gap: "5px",
												}}
											>
												{ratingStar(product.rating)}
											</div>

											<button
												type="button"
												onClick={() =>
													navigate(
														`/product?id=${product.id}`
													)
												}
											>
												View
											</button>
										</div>
									</div>
								))}
						</div>
					</div>
				))}
			</div>
		</Layout>
	);
};

export default HomePage;
