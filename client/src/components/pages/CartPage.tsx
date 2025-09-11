import React, { useCallback, useEffect, useState } from "react";
import { Button, Container, Modal } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { BsArrowLeft, BsArrowRight } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import "../../styles/CartPage.scss";
import AsideCart from "../common/AsideCart";
import CartItem from "../common/CartItem";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";
import CheckoutPaymentPage from "./CheckoutPaymentPage";
import { useAuth } from "../../context/AuthContext";

type CartProps = {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number;
    main_image: string;
    quantity: number;
};

const CartPage = () => {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    const [cart, setCart] = useState<CartProps[]>([]);
    const [totalPrice, setTotalPrice] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [subtotal, setSubtotal] = useState<number>(0);
    console.log(totalPrice, discount);
    const [error, setError] = useState<string>("");
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);

    const handleShow = useCallback(() => setShow(true), []);
    const handleClose = useCallback(() => setShow(false), []);
    const togglePayment = useCallback(() => setIsPayment((prev) => !prev), []);
    const updateQuantity = (itemId: number, newQuantity: number) => {
        setCart((prevCart: CartProps[]) =>
            prevCart.map((item) => (item.cartItemId === itemId ? { ...item, quantity: newQuantity } : item))
        );
    };

    const handleQuantityChange = (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => {
        const newQuantity = parseInt(event.target.value, 10);
        updateQuantity(itemId, newQuantity);
    };

    const handleClickPayment = useCallback(() => {
        togglePayment();
        setShow(false);
    }, [togglePayment]);

    const handleRemoveCartItem = useCallback(
        async (cartItemId: number) => {
            try {
                const response = await axios.delete(`/api/cart/`, {
                    data: { cartItemId },
                });
                if (response.status === 200) {
                    console.log(response.data.msg);
                    setCart((cart) => cart.filter((cart) => cart.cartItemId !== cartItemId));
                    addToast("Remove Cart item", "Item removed from cart successfully");
                }
            } catch (err) {
                console.error(err);
            }
        },
        [addToast]
    );

    const applyDiscount = async (discountCode: string, price: number) => {
        try {
            const response = await axios.post(`/api/orders/discount`, {
                discountCode,
                price,
            });
            if (response.status === 200) {
                const newPrice = response.data.newPrice;
                setDiscount(totalPrice - newPrice);
                setSubtotal(newPrice);
                setError("");
                addToast("Applying Coupon", "Coupon has been applied successfully");
            }
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const errorResponse = (err as { response: { status: number; data: { msg: string } } }).response;
                if (errorResponse.status === 404) {
                    addToast("Applying Coupon", "Discount code not found");
                } else if (errorResponse.status === 500) {
                    addToast("Applying Coupon", "Internal server error, please try again later");
                }
                setError(`Status code: ${errorResponse.status}, Message: ${errorResponse.data.msg}`);
                console.error(`${errorResponse.data.msg}`);
            }
        }
    };

    useEffect(() => {
        const fetchCartItems = async () => {
            try {
                const response = await axios.get(`/api/cart/${uid}`);
                if (response.status === 200) {
                    const cartItems: CartProps[] = response.data.cartItems.map((item: any) => ({
                        cartItemId: item.cart_item_id,
                        productId: item.product_id,
                        productName: item.product_name,
                        category: item.category,
                        brand: item.brand,
                        price: item.price,
                        sale_price: item.sale_price,
                        main_image: item.main_image,
                        quantity: item.quantity,
                    }));
                    setCart(cartItems);
                }
            } catch (err) {
                console.error(err);
            }
        };

        if (uid) {
            fetchCartItems();
        }
    }, [uid]);

    useEffect(() => {
        const newTotalPrice = cart.reduce((acc, item) => acc + (item.sale_price || item.price) * item.quantity, 0);
        setTotalPrice(newTotalPrice);
        setSubtotal(newTotalPrice - discount);
    }, [cart, discount]);

    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>Cart</title>
                <meta name="description" content="View and manage your shopping cart items." />
            </Helmet>
            <Container fluid className="cart__container">
                {isPayment ? (
                    <CheckoutPaymentPage
                        setIsPayment={setIsPayment}
                        cart={cart}
                        totalPrice={totalPrice}
                        discount={discount}
                        subtotal={subtotal}
                    />
                ) : (
                    <>
                        {" "}
                        <h2 className="cart__container__title">Shopping Cart</h2>
                        <main className="cart__container__box">
                            <section className="cart__container__box__main">
                                <div className="cart__container__box__main__list">
                                    {cart.map((item) => (
                                        <CartItem
                                            key={item.cartItemId}
                                            item={item}
                                            handleQuantityChange={handleQuantityChange}
                                            handleRemoveCartItem={handleRemoveCartItem}
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
                            </section>
                            <AsideCart
                                totalPrice={totalPrice}
                                discount={discount}
                                subtotal={subtotal}
                                error={error}
                                applyDiscount={applyDiscount}
                            />
                        </main>
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
