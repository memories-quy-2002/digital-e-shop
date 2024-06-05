import React, { useEffect, useState } from "react";
import { Button, Container, Modal } from "react-bootstrap";
import { BsArrowLeft, BsArrowRight } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import "../../styles/CartPage.scss";
import AsideCart from "../common/AsideCart";
import CartItem from "../common/CartItem";
import Layout from "../layout/Layout";
import CheckoutPaymentPage from "./CheckoutPaymentPage";

const cookies = new Cookies();

interface CartProps {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    image: string;
    quantity: number;
}

const CartPage = () => {
    const navigate = useNavigate();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const [cart, setCart] = useState<CartProps[]>([]);
    const [totalPrice, setTotalPrice] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);

    useEffect(() => {
        setTotalPrice(
            cart.reduce((acc, item) => acc + item.price * item.quantity, 0)
        );
    }, [cart]);

    const handleShow = () => setShow(true);
    const handleClose = () => setShow(false);
    const togglePayment = () => setIsPayment(!isPayment);
    const updateQuantity = (
        cart: CartProps[],
        itemId: number,
        newQuantity: number
    ) => {
        setCart((prevCart: CartProps[]) =>
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

    const handleClickPayment = () => {
        togglePayment();
        setShow(false);
    };

    const handleRemove = async (cartItemId: number) => {
        try {
            const response = await axios.post(`/api/cart/delete`, {
                cartItemId,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
        }
    };

    useEffect(() => {
        const fetchCartItems = async () => {
            try {
                const response = await axios.get(`/api/cart/${uid}`);
                if (response.status === 200) {
                    const cartItems: CartProps[] = response.data.cartItems.map(
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
                {isPayment ? (
                    <CheckoutPaymentPage
                        setIsPayment={setIsPayment}
                        cart={cart}
                        totalPrice={totalPrice}
                        discount={discount}
                    />
                ) : (
                    <>
                        {" "}
                        <h3 className="cart__container__title">
                            Shopping Cart
                        </h3>
                        <div className="cart__container__box">
                            <div className="cart__container__box__main">
                                <div className="cart__container__box__main__list">
                                    {cart.map((item) => (
                                        <CartItem
                                            key={item.cartItemId}
                                            item={item}
                                            handleQuantityChange={
                                                handleQuantityChange
                                            }
                                            handleRemove={handleRemove}
                                        />
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
                            <AsideCart
                                totalPrice={totalPrice}
                                discount={discount}
                            />
                        </div>{" "}
                    </>
                )}

                <Modal show={show} onHide={handleClose} animation={false}>
                    <Modal.Header closeButton>
                        <Modal.Title>Purchase Confirmation</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>Are you sure to make purchase?</Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={handleClose}>
                            Close
                        </Button>
                        <Button variant="primary" onClick={handleClickPayment}>
                            Confirm
                        </Button>
                    </Modal.Footer>
                </Modal>
            </Container>
        </Layout>
    );
};

export default CartPage;
