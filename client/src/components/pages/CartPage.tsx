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
    const [error, setError] = useState<string>("");
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);

    const handleShow = useCallback(() => setShow(true), []);
    const handleClose = useCallback(() => setShow(false), []);
    const togglePayment = useCallback(() => setIsPayment((prev) => !prev), []);
    const updateQuantity = (itemId: number, newQuantity: number) => {
        setCart((prevCart: CartProps[]) =>
            prevCart.map((item) => (item.cartItemId === itemId ? { ...item, quantity: newQuantity } : item)),
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
                    setCart((cart) => cart.filter((cart) => cart.cartItemId !== cartItemId));
                    addToast("Remove Cart item", "Item removed from cart successfully");
                }
            } catch (err) {
                addToast("Remove Cart item", "Unable to remove item from cart.");
            }
        },
        [addToast],
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
                addToast("Cart", "Unable to load cart items.");
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
            <Helmet>
                <title>Your Cart | Digital-E</title>
                <meta name="description" content="Review your items, update quantities, and proceed to checkout." />
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
                        <header className="cart__header">
                            <div>
                                <span className="cart__header__eyebrow">Your cart</span>
                                <h2>Review your items before checkout</h2>
                                <p>Update quantities, apply a coupon, and get ready to place your order.</p>
                            </div>
                            <div className="cart__header__summary">
                                <div>
                                    <strong>{cart.length}</strong>
                                    <span>Items</span>
                                </div>
                                <div>
                                    <strong>${subtotal.toFixed(2)}</strong>
                                    <span>Estimated total</span>
                                </div>
                            </div>
                        </header>

                        <main className="cart__layout">
                            <section className="cart__layout__main">
                                <div className="cart__layout__list">
                                    {cart.length === 0 ? (
                                        <div className="cart__layout__empty">
                                            <h3>Your cart is empty</h3>
                                            <p>Browse our collection and add items to your cart.</p>
                                            <button type="button" onClick={() => navigate("/shops")}>
                                                Shop now
                                            </button>
                                        </div>
                                    ) : (
                                        cart.map((item) => (
                                            <CartItem
                                                key={item.cartItemId}
                                                item={item}
                                                handleQuantityChange={handleQuantityChange}
                                                handleRemoveCartItem={handleRemoveCartItem}
                                            />
                                        ))
                                    )}
                                </div>

                                <div className="cart__layout__actions">
                                    <button className="ghost" onClick={() => navigate("/")}>
                                        <BsArrowLeft /> Continue shopping
                                    </button>
                                    <button className="primary" onClick={handleShow} disabled={cart.length === 0}>
                                        Proceed to checkout <BsArrowRight />
                                    </button>
                                </div>
                                <div className="cart__layout__note">
                                    Free delivery in 1-2 business days for orders over $50.
                                </div>
                            </section>

                            <aside className="cart__layout__aside">
                                <AsideCart
                                    totalPrice={totalPrice}
                                    discount={discount}
                                    subtotal={subtotal}
                                    error={error}
                                    applyDiscount={applyDiscount}
                                />
                            </aside>
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
