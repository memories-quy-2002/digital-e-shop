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
import {
    CartValidationIssue,
    CheckoutCartItem,
    getCartValidationMessage,
    normalizeCheckoutCartItems,
} from "../types";
import http from "../../../lib/http";
import "../../../styles/features/orders/_cart.scss";
import CheckoutPaymentPage from "../components/CheckoutPaymentPage";

type DiscountActionResult = {
    status: "idle" | "success" | "error";
    title?: string;
    message?: string;
};

const CartPage = () => {
    const navigate = useNavigate();
    const { userData } = useAuth();
    const uid = userData?.id || null;
    const { addToast } = useToast();
    const [cart, setCart] = useState<CheckoutCartItem[]>([]);
    const [totalPrice, setTotalPrice] = useState<number>(0);
    const [discount, setDiscount] = useState<number>(0);
    const [subtotal, setSubtotal] = useState<number>(0);
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);
    const [pendingRemoveItem, setPendingRemoveItem] = useState<CheckoutCartItem | null>(null);
    const [isRemovingItem, setIsRemovingItem] = useState(false);
    const [isValidatingCheckout, setIsValidatingCheckout] = useState(false);
    const [validationIssues, setValidationIssues] = useState<CartValidationIssue[]>([]);

    const handleClose = useCallback(() => setShow(false), []);
    const togglePayment = useCallback(() => setIsPayment((prev) => !prev), []);

    const updateQuantity = (itemId: number, newQuantity: number) => {
        setCart((prevCart: CheckoutCartItem[]) =>
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

    const localValidationIssues: CartValidationIssue[] = cart.flatMap((item): CartValidationIssue[] => {
        if (item.stock <= 0) {
            return [
                {
                    cartItemId: item.cartItemId,
                    productId: item.productId,
                    productName: item.productName,
                    requestedQuantity: item.quantity,
                    availableStock: item.stock,
                    reason: "out_of_stock" as const,
                },
            ];
        }

        if (item.quantity > item.stock) {
            return [
                {
                    cartItemId: item.cartItemId,
                    productId: item.productId,
                    productName: item.productName,
                    requestedQuantity: item.quantity,
                    availableStock: item.stock,
                    reason: "insufficient_stock" as const,
                },
            ];
        }

        return [];
    });
    const activeValidationIssues = validationIssues.length > 0 ? validationIssues : localValidationIssues;
    const issueByCartItemId = new Map<number, CartValidationIssue>(
        activeValidationIssues
            .filter((issue): issue is CartValidationIssue & { cartItemId: number } => typeof issue.cartItemId === "number")
            .map((issue) => [issue.cartItemId, issue]),
    );

    const refreshCartFromValidation = (cartItems?: any[]) => {
        if (Array.isArray(cartItems)) {
            setCart(normalizeCheckoutCartItems(cartItems));
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
            setValidationIssues([]);
            return response.status === 200 && response.data.valid === true;
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const response = (err as {
                    response?: { data?: { msg?: string; issues?: CartValidationIssue[]; cartItems?: any[] } };
                }).response;
                refreshCartFromValidation(response?.data?.cartItems);
                const issues: CartValidationIssue[] = response?.data?.issues || [];
                setValidationIssues(issues);
                addToast("Checkout blocked", getCartValidationMessage(issues));
            } else {
                setValidationIssues([]);
                addToast("Checkout blocked", "Unable to validate cart stock right now.");
            }
            return false;
        } finally {
            setIsValidatingCheckout(false);
        }
    }, [addToast, uid]);

    const handleShow = useCallback(async () => {
        if (localValidationIssues.length > 0) {
            setValidationIssues(localValidationIssues);
            addToast("Checkout blocked", getCartValidationMessage(localValidationIssues));
            return;
        }

        if (await validateCartBeforeCheckout()) {
            setShow(true);
        }
    }, [addToast, localValidationIssues, validateCartBeforeCheckout]);

    const handleClickPayment = useCallback(() => {
        if (activeValidationIssues.length > 0) {
            addToast("Checkout blocked", getCartValidationMessage(activeValidationIssues));
            setShow(false);
            return;
        }
        togglePayment();
        setShow(false);
    }, [activeValidationIssues, addToast, togglePayment]);

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

    const handleValidationRefresh = useCallback((nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => {
        setCart(nextCart);
        setValidationIssues(issues);
    }, []);

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
                    setCart(normalizeCheckoutCartItems(response.data.cartItems));
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
        if (localValidationIssues.length === 0 && validationIssues.length > 0) {
            setValidationIssues([]);
        }
    }, [localValidationIssues.length, validationIssues.length]);

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
            <Container fluid className="cart app-page">
                {isPayment ? (
                    <CheckoutPaymentPage
                        setIsPayment={setIsPayment}
                        cart={cart}
                        totalPrice={totalPrice}
                        discount={discount}
                        subtotal={subtotal}
                        validationIssues={activeValidationIssues}
                        onValidationRefresh={handleValidationRefresh}
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
                                <div className="cart__list-card">
                                    <div className="cart__list-header">
                                        <div>
                                            <h3>Cart items</h3>
                                            <p>Keep quantities accurate before moving into checkout.</p>
                                        </div>
                                        <span>{cart.length} item(s)</span>
                                    </div>
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
                                                    validationIssue={issueByCartItemId.get(item.cartItemId)}
                                                    handleQuantityChange={handleQuantityChange}
                                                    handleRemoveCartItem={handleRemoveCartItem}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="cart__actions">
                                    <button className="cart__action cart__action--ghost" onClick={() => navigate("/")}>
                                        <ArrowLeftIcon /> Continue shopping
                                    </button>
                                    <button
                                        className="cart__action cart__action--primary"
                                        onClick={handleShow}
                                        disabled={cart.length === 0 || isValidatingCheckout}
                                    >
                                        {isValidatingCheckout ? "Checking stock..." : "Proceed to checkout"} <ArrowRightIcon />
                                    </button>
                                </div>
                                <div className="cart__support">
                                    {activeValidationIssues.length > 0 ? (
                                        <div className="cart__warning">
                                            <strong>Checkout needs updates.</strong>
                                            <span>{getCartValidationMessage(activeValidationIssues)}</span>
                                            {activeValidationIssues.length > 1 ? (
                                                <small>{activeValidationIssues.length} cart items need attention.</small>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div className="cart__note">
                                        Free delivery in 1-2 business days for orders over $50.
                                    </div>
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
