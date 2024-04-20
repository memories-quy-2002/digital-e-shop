import React from "react";
import { Product } from "../../utils/interface";
import { useNavigate } from "react-router-dom";
import { BsHeart, BsHeartFill } from "react-icons/bs";
import ratingStar from "../../utils/ratingStar";
import axios from "../../api/axios";

type Props = { product: Product; uid: string, isWishlist: boolean };

const ProductItem = ({ product, uid, isWishlist }: Props) => {
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
	const onAddingCart = async (user_id: string, product_id: number) => {
		if (uid === "") {
			navigate("/login")
			
		}
		try {
			const response = await axios.post("/api/cart/", {
				uid: user_id,
				pid: product_id,
			});
			if (response.status === 200) {
				console.log(response.data.msg);
			}
		} catch (err) {
			throw err;
		}
	}
	const navigate = useNavigate();
	return (
		<div className="home__product__menu__item" key={product.id}>
			<div
				className="home__product__menu__item__image"
				onClick={() => navigate(`/product?id=${product.id}`)}
			>
				<img
					src={
						product.main_image
							? require(`../../assets/images/${product.main_image}.jpg`)
							: require(`../../assets/images/product_placeholder.jpg`)
					}
					alt="Empty"
				/>
			</div>

			<div className="home__product__menu__item__wishlist">0</div>

			<div
				className="home__product__menu__item__like"
				onClick={() => onAddingWishlist(uid, product.id)}
			>
				{isWishlist ? <BsHeartFill size={24} color="red"/> : <BsHeart size={24} color="red"/>}
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
					onClick={() => onAddingCart(uid, product.id)}
				>
					Add to cart
				</button>
			</div>
		</div>
	);
};

export default ProductItem;
