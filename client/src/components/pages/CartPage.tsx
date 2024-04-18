import React, { useEffect, useState } from "react";
import { Container, Modal, Button } from "react-bootstrap";
import { BsArrowLeft, BsArrowRight, BsBank } from "react-icons/bs";
import { FaBitcoin, FaCcVisa } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/CartPage.scss";
import Layout from "../layout/Layout";

const cookies = new Cookies();

interface CartItem {
	cartItemId: number;
	productId: number;
	productName: string;
	category: string;
	brand: string;
	price: number;
	image: string;
	quantity: number;
}

const paymentMethods: any[] = [
	<BsBank size={36} />,
	<FaCcVisa size={36} />,
	<FaBitcoin size={36} />,
];

const CartPage = () => {
	const navigate = useNavigate();
	const uid =
		cookies.get("rememberMe")?.uid ||
		(sessionStorage["rememberMe"]
			? JSON.parse(sessionStorage["rememberMe"]).uid
			: "");
	const [cart, setCart] = useState<CartItem[]>([]);
	const [totalPrice, setTotalPrice] = useState<number>(0);
	const [discount, setDiscount] = useState<number>(0);
	const [show, setShow] = useState<boolean>(false);

	const handleShow = () => setShow(true);
	const handleClose = () => setShow(false);
	const updateQuantity = (
		cart: CartItem[],
		itemId: number,
		newQuantity: number
	) => {
		setCart((prevCart: CartItem[]) =>
			prevCart.map((item) =>
				item.cartItemId === itemId
					? { ...item, quantity: newQuantity }
					: item
			)
		);
	};

	const handleQuantityChange = (
		itemId: number,
		event: React.ChangeEvent<HTMLInputElement>
	) => {
		const newQuantity = parseInt(event.target.value, 10);
		updateQuantity(cart, itemId, newQuantity);
	};

	const handlePurchase = async () => {
		try {
			const response = await axios.post(`/api/purchase/${uid}`, cart);
			if (response.status === 200) {
				console.log(response.data.msg);
				navigate("/checkout-success");
			}
		} catch (err) {
			console.error(err);
		}
	};

	useEffect(() => {
		setTotalPrice(
			cart.reduce((acc, item) => acc + item.price * item.quantity, 0)
		);
	}, [cart]);

	useEffect(() => {
		const fetchCartItems = async () => {
			try {
				const response = await axios.get(`/api/cart/${uid}`);
				if (response.status === 200) {
					console.log(response.data.msg);
					const cartItems: CartItem[] = response.data.cartItems.map(
						(item: any) => {
							return {
								...item,
								cartItemId: item.cart_item_id,
								productId: item.product_id,
								productName: item.product_name,
								image: item.main_image,
							};
						}
					);
					setCart(cartItems);
				}
			} catch (err) {
				console.error(err);
			}
		};
		fetchCartItems();
	}, [uid]);
	console.log(cart);

	return (
		<Layout>
			<Container fluid className="cart__container">
				<h3 className="cart__container__title">Shopping Cart</h3>
				<div className="cart__container__box">
					<div className="cart__container__box__main">
						<div className="cart__container__box__main__list">
							{cart.map((item) => (
								<div
									key={item.cartItemId}
									className="cart__container__box__main__list__item"
								>
									<div className="cart__container__box__main__list__item__image">
										<img
											src={
												item.image
													? require(`../../assets/images/${item.image}.jpg`)
													: require(`../../assets/images/product_placeholder.jpg`)
											}
											alt="Empty"
										/>
									</div>
									<div className="cart__container__box__main__list__item__info">
										<strong>{item.productName}</strong>
										<p>Category: {item.category}</p>
										<p>Brand: {item.brand}</p>
									</div>
									<input
										type="number"
										name="quantity"
										id={`cart-${item.cartItemId}`}
										value={item.quantity}
										onChange={(event) =>
											handleQuantityChange(
												item.cartItemId,
												event
											)
										}
									/>
									<div className="cart__container__box__main__list__item__price">
										<strong style={{ fontSize: "20px" }}>
											${item.price * item.quantity}
										</strong>
										<p>${item.price} each</p>
									</div>
									<button>Remove</button>
								</div>
							))}
						</div>
						<div className="cart__container__box__main__buttons">
							<button
								className="cart__container__box__main__buttons__continue"
								onClick={() => navigate("/")}
							>
								<BsArrowLeft /> Continue shopping
							</button>
							<button
								className="cart__container__box__main__buttons__purchase"
								onClick={handleShow}
							>
								Make purchase <BsArrowRight />
							</button>
						</div>
						<div className="cart__container__box__main__notification">
							Free delivery for 1-2 days
						</div>
					</div>
					<div className="cart__container__box__aside">
						<div className="cart__container__box__aside__box">
							<div className="cart__container__box__aside__box__coupon">
								<h4 className="cart__container__box__aside__box__coupon__title">
									Have coupon?
								</h4>
								<div className="cart__container__box__aside__box__coupon__input">
									<input
										type="text"
										name="coupon"
										id="coupon"
										placeholder="Coupon code"
									/>
									<button>Apply</button>
								</div>
							</div>
							<hr />
							<div className="cart__container__box__aside__box__price">
								<ul className="cart__container__box__aside__box__price__list">
									<li>
										<p>Total price: </p>
										<p>${totalPrice.toFixed(2)}</p>
									</li>
									<li>
										<p>Discount: </p>
										<p>${discount.toFixed(2)}</p>
									</li>
									<li
										style={{
											fontWeight: "bold",
											fontSize: "18px",
										}}
									>
										<p>Subtotal: </p>
										<p>
											$
											{(totalPrice - discount).toFixed(2)}
										</p>
									</li>
								</ul>
							</div>
							<hr />
							<div className="cart__container__box__aside__box__payment">
								<h6>Payment method</h6>
								<div>
									<ul
										style={{
											listStyleType: "none",
											display: "flex",
											flexDirection: "row",
											justifyContent: "space-around",
											padding: "0",
										}}
									>
										{paymentMethods.map((icon) => (
											<li style={{ cursor: "pointer" }}>
												{icon}
											</li>
										))}
									</ul>
								</div>
							</div>
						</div>
					</div>
				</div>
				<Modal show={show} onHide={handleClose} animation={false}>
					<Modal.Header closeButton>
						<Modal.Title>Purchase Confirmation</Modal.Title>
					</Modal.Header>
					<Modal.Body>Are you sure to make purchase?</Modal.Body>
					<Modal.Footer>
						<Button variant="secondary" onClick={handleClose}>
							Close
						</Button>
						<Button variant="primary" onClick={handlePurchase}>
							Confirm
						</Button>
					</Modal.Footer>
				</Modal>
			</Container>
		</Layout>
	);
};

export default CartPage;
