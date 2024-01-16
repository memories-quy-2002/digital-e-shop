import { IoArrowForward } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import iphone from "../../assets/images/iphone.jpg";
import placeholder from "../../assets/images/product_placeholder.jpg";
import "../../styles/HomePage.scss";
import ratingStar from "../../utils/ratingStar";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";

interface Product {
	id: number;
	name: string;
	category: string;
	price: number;
	sale_price: number;
	rating: number;
	image: string;
}

const newProducts: Product[] = [
	{
		id: 1,
		name: "ASUS F15 TUF Gaming",
		category: "Laptop",
		price: 1049.0,
		sale_price: 749.0,
		rating: 5, // Example rating
		image: "laptop-asus",
	},
	{
		id: 2,
		name: "Iphone 15 Pro Max",
		category: "Smartphone",
		price: 999.0,
		sale_price: 0,
		rating: 5, // Example rating
		image: "smartphone-iphone15",
	},
	{
		id: 3,
		name: "USB Kingston 32GB",
		category: "Accessories",
		price: 3.33,
		sale_price: 0,
		rating: 5, // Example rating
		image: "usb-kingston",
	},
	{
		id: 4,
		name: "Monitor LG-24GN65R",
		category: "Monitor",
		price: 399.0,
		sale_price: 199.0,
		rating: 4.7, // Example rating
		image: "monitor-lg",
	},
	{
		id: 5,
		name: "Nikon D7100 DSLR Camera",
		category: "Camera",
		price: 799.0,
		sale_price: 625.0,
		rating: 4.5, // Example rating
		image: "camera-nikon",
	},
	{
		id: 6,
		name: "LG 55UK6750PLD 55 Inch",
		category: "Television",
		price: 999.0,
		sale_price: 0,
		rating: 5, // Example rating
		image: "tv-lg",
	},
	{
		id: 7,
		name: "Webcam Logitech HD C270",
		category: "Webcam",
		price: 15.99,
		sale_price: 0,
		rating: 4, // Example rating
		image: "webcam-logitech",
	},
	{
		id: 8,
		name: "Xiaomi Mijia Ultra-Thin Cross 521L",
		category: "Refrigerator",
		price: 599.0,
		sale_price: 499.0,
		rating: 5, // Example rating
		image: "refrigerator-xiaomi",
	},
	// Add more products in the same format
];

const HomePage = () => {
	const navigate = useNavigate();

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
				<div className="home__product">
					<h3 className="home__product__title">New products</h3>
					<div className="home__product__menu">
						{newProducts.map((product) => (
							<div
								className="home__product__menu__item"
								key={product.id}
							>
								<div className="home__product__menu__item__image">
									<img
										src={require(`../../assets/images/${product.image}.jpg`)}
										alt="Empty"
										style={{ width: "100%", height: "75%" }}
									/>
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
									}}
								>
									{product.name}
								</p>
								<p
									style={{
										textAlign: "center",
										fontWeight: "bold",
										color: "#0C4AE7",
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
				<div
					style={{
						width: "90%",
						textAlign: "right",
						margin: "2rem auto",
					}}
				>
					<a
						href="/listProducts"
						target="blank"
						style={{ textDecoration: "none", fontSize: "20px" }}
					>
						More products <IoArrowForward />
					</a>
				</div>
			</div>
		</Layout>
	);
};

export default HomePage;
