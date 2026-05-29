import React, { useCallback, useEffect, useState } from "react";
import { Button, Container, Modal } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import AsideCart from "../../../components/common/AsideCart";
import CartItem from "../../../components/common/CartItem";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { ArrowLeftIcon, ArrowRightIcon } from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import http from "../../../lib/http";
import "../../../styles/CartPage.scss";
import CheckoutPaymentPage from "../components/CheckoutPaymentPage";

type CartProps = {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price: number | null;
    main_image: string;
    quantity: number;
    stock: number;
};

type DiscountActionResult = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

type CartValidationIssue = {
    productName: string;
    requestedQuantity: number;
    availableStock: number;
    reason: "out_of_stock" | "insufficient_stock";
};

const normalizeCartItems = (items: any[]): CartProps[] =>
    items.map((item: any) => ({
        cartItemId: item.cart_item_id,
        productId: item.product_id,
        productName: item.product_name,
        category: item.category,
        brand: item.brand,
        price: item.price,
        sale_price: item.sale_price,
        main_image: item.main_image,
        quantity: item.quantity,
        stock: item.stock,
    }));

const CartPage = () => {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    const [cart, setCart] = useState<CartProps[]>([]);
    const [totalPrice, setTotalPrice] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [subtotal, setSubtotal] = useState<number>(0);
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);
    const [pendingRemoveItem, setPendingRemoveItem] = useState<CartProps | null>(null);
    const [isRemovingItem, setIsRemovingItem] = useState(false);
    const [isValidatingCheckout, setIsValidatingCheckout] = useState(false);

    const handleClose = useCallback(() => setShow(false), []);
    const togglePayment = useCallback(() => setIsPayment((prev) => !prev), []);

    const updateQuantity = (itemId: number, newQuantity: number) => {
        setCart((prevCart: CartProps[]) =>
            prevCart.map((item) => (item.cartItemId === itemId ? { ...item, quantity: newQuantity } : item)),
        );
    };

    const handleQuantityChange = async (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => {
        const item = cart.find((cartItem) => cartItem.cartItemId === itemId);
        if (!item || !uid) {
            return;
        }

        const requestedQuantity = Math.max(1, parseInt(event.target.value, 10) || 1);
        const newQuantity = Math.min(requestedQuantity, item.stock);
        if (requestedQuantity > item.stock) {
            addToast("Quantity adjusted", `Only ${item.stock} item(s) available for ${item.productName}.`);
        }

        updateQuantity(itemId, newQuantity);

        try {
            await http.put("/api/cart/", {
                uid,
                cartItemId: itemId,
                quantity: newQuantity,
            });
        } catch {
            addToast("Cart", "Unable to save the quantity change.");
        }
    };

    const unavailableItems = cart.filter((item) => item.stock <= 0 || item.quantity > item.stock);
    const getCartValidationMessage = (issues: CartValidationIssue[]) => {
        const firstIssue = issues[0];
        if (!firstIssue) {
            return "Some cart items are unavailable or exceed current stock.";
        }

        if (firstIssue.reason === "out_of_stock") {
            return `${firstIssue.productName} is out of stock.`;
        }

        return `${firstIssue.productName} has only ${firstIssue.availableStock} item(s) available.`;
    };

    const refreshCartFromValidation = (cartItems?: any[]) => {
        if (Array.isArray(cartItems)) {
            setCart(normalizeCartItems(cartItems));
        }
    };

    const validateCartBeforeCheckout = useCallback(async () => {
        if (!uid) {
            addToast("Checkout blocked", "Please login before checkout.");
            return false;
        }

        try {
            setIsValidatingCheckout(true);
            const response = await http.get(`/api/cart/${uid}/validation`);
            refreshCartFromValidation(response.data.cartItems);
            return response.status === 200 && response.data.valid === true;
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const response = (err as {
                    response?: { data?: { msg?: string; issues?: CartValidationIssue[]; cartItems?: any[] } };
                }).response;
                refreshCartFromValidation(response?.data?.cartItems);
                addToast("Checkout blocked", getCartValidationMessage(response?.data?.issues || []));
            } else {
                addToast("Checkout blocked", "Unable to validate cart stock right now.");
            }
            return false;
        } finally {
            setIsValidatingCheckout(false);
        }
    }, [addToast, uid]);

    const handleShow = useCallback(async () => {
        if (unavailableItems.length > 0) {
            addToast("Checkout blocked", "Some cart items are unavailable or exceed current stock.");
            return;
        }

        if (await validateCartBeforeCheckout()) {
            setShow(true);
        }
    }, [addToast, unavailableItems.length, validateCartBeforeCheckout]);

    const handleClickPayment = useCallback(() => {
        if (unavailableItems.length > 0) {
            addToast("Checkout blocked", "Some cart items are unavailable or exceed current stock.");
            setShow(false);
            return;
        }
        togglePayment();
        setShow(false);
    }, [addToast, togglePayment, unavailableItems.length]);

    const handleConfirmRemoveCartItem = useCallback(
        async () => {
            if (!pendingRemoveItem) {
                return;
            }
            try {
                setIsRemovingItem(true);
                const response = await http.delete("/api/cart/", {
                    data: { cartItemId: pendingRemoveItem.cartItemId },
                });
                if (response.status === 200) {
                    setCart((currentCart) =>
                        currentCart.filter((item) => item.cartItemId !== pendingRemoveItem.cartItemId),
                    );
                    addToast("Remove Cart item", "Item removed from cart successfully");
                    setPendingRemoveItem(null);
                }
            } catch {
                addToast("Remove Cart item", "Unable to remove item from cart.");
            } finally {
                setIsRemovingItem(false);
            }
        },
        [addToast, pendingRemoveItem],
    );

    const handleRemoveCartItem = useCallback(
        (cartItemId: number) => {
            const item = cart.find((cartItem) => cartItem.cartItemId === cartItemId) || null;
            setPendingRemoveItem(item);
        },
        [cart],
    );

    const applyDiscount = async (discountCode: string, price: number): Promise<DiscountActionResult> => {
        try {
            const response = await http.post("/api/orders/discount", {
                discountCode,
                price,
            });
            if (response.status === 200) {
                const newPrice = response.data.newPrice;
                setDiscount(price - newPrice);
                setSubtotal(newPrice);
                return {
                    status: "success",
                    title: "Applying Coupon",
                    message: "Coupon has been applied successfully",
                };
            }

            return {
                status: "error",
                title: "Applying Coupon",
                message: "Unable to apply coupon right now.",
            };
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const errorResponse = (err as { response: { status: number } }).response;
                if (errorResponse.status === 404) {
                    return { status: "error", title: "Applying Coupon", message: "Discount code not found" };
                }
                if (errorResponse.status === 500) {
                    return {
                        status: "error",
                        title: "Applying Coupon",
                        message: "Internal server error, please try again later",
                    };
                }
            }

            return {
                status: "error",
                title: "Applying Coupon",
                message: "Unable to apply coupon right now.",
            };
        }
    };

    useEffect(() => {
        const fetchCartItems = async () => {
            try {
                const response = await http.get(`/api/cart/${uid}`);
                if (response.status === 200) {
                    setCart(normalizeCartItems(response.data.cartItems));
                }
            } catch {
                addToast("Cart", "Unable to load cart items.");
            }
        };

        if (uid) {
            fetchCartItems();
        }
    }, [addToast, uid]);

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
            <Container fluid className="cart">
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
                            <section className="cart__main">
                                <div className="cart__list">
                                    {cart.length === 0 ? (
                                        <div className="cart__empty">
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

                                <div className="cart__actions">
                                    <button className="ghost" onClick={() => navigate("/")}>
                                        <ArrowLeftIcon /> Continue shopping
                                    </button>
                                    <button
                                        className="primary"
                                        onClick={handleShow}
                                        disabled={cart.length === 0 || isValidatingCheckout}
                                    >
                                        {isValidatingCheckout ? "Checking stock..." : "Proceed to checkout"} <ArrowRightIcon />
                                    </button>
                                </div>
                                {unavailableItems.length > 0 ? (
                                    <div className="cart__warning">
                                        Some items need attention before checkout. Update quantities or remove
                                        unavailable products.
                                    </div>
                                ) : null}
                                <div className="cart__note">
                                    Free delivery in 1-2 business days for orders over $50.
                                </div>
                            </section>

                            <aside className="cart__sidebar">
                                <AsideCart
                                    totalPrice={totalPrice}
                                    discount={discount}
                                    subtotal={subtotal}
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
                <ConfirmActionModal
                    show={pendingRemoveItem !== null}
                    title="Remove cart item"
                    message={`Remove "${pendingRemoveItem?.productName || "this item"}" from your cart?`}
                    confirmLabel="Remove"
                    isConfirming={isRemovingItem}
                    onCancel={() => setPendingRemoveItem(null)}
                    onConfirm={handleConfirmRemoveCartItem}
                />
            </Container>
        </Layout>
    );
};

export default CartPage;
