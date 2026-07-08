import React, { useCallback, useMemo, useState } from "react";
import { Button, Container, Modal } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import AsideCart from "../../../components/common/AsideCart";
import CartItem from "../../../components/common/CartItem";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { ArrowLeftIcon, ArrowRightIcon, CartIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import LoadingScreen from "../../../components/common/LoadingScreen";
import Layout from "../../../components/layout/Layout";
import { useToast } from "../../../context/ToastContext";
import { useCart } from "../../../context/CartContext";
import type { CartValidationIssue, CheckoutCartItem } from "../types";
import { getCartValidationMessage } from "../types";
import "../../../styles/features/orders/_cart.scss";
import CheckoutPaymentPage from "../components/CheckoutPaymentPage";
import { useT } from "../../../hooks/useT";

const CartPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const t = useT();
    const {
        items: cart,
        totalPrice,
        discount,
        subtotal,
        validationIssues,
        isLoading: isCartLoading,
        isRemovingItem,
        pendingRemoveItem,
        updateQuantity: contextUpdateQuantity,
        removeItem,
        confirmRemoveItem,
        cancelRemoveItem,
        applyDiscount,
        validateBeforeCheckout,
        onValidationRefresh,
    } = useCart();
    const [show, setShow] = useState<boolean>(false);
    const [isPayment, setIsPayment] = useState<boolean>(false);
    const [isValidatingCheckout, setIsValidatingCheckout] = useState(false);

    const handleClose = useCallback(() => setShow(false), []);
    const togglePayment = useCallback(() => setIsPayment((prev) => !prev), []);

    const handleQuantityChange = async (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => {
        const item = cart.find((cartItem) => cartItem.cartItemId === itemId);
        if (!item) return;

        const requestedQuantity = Math.max(1, parseInt(event.target.value, 10) || 1);
        const newQuantity = Math.min(requestedQuantity, item.stock);
        if (requestedQuantity > item.stock) {
            addToast(
                t("cart.outOfStock"),
                `${t("cart.insufficientStock", item.stock).replace(/[.!]?$/, "")} (${item.productName}).`,
            );
        }

        await contextUpdateQuantity(itemId, newQuantity);
    };

    const localValidationIssues: CartValidationIssue[] = useMemo(
        () =>
            cart.flatMap((item): CartValidationIssue[] => {
                if (item.stock <= 0) {
                    return [
                        {
                            cartItemId: item.cartItemId,
                            productId: item.productId,
                            productName: item.productName,
                            requestedQuantity: item.quantity,
                            availableStock: item.stock,
                            reason: "out_of_stock",
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
                            reason: "insufficient_stock",
                        },
                    ];
                }
                return [];
            }),
        [cart],
    );

    const activeValidationIssues = validationIssues.length > 0 ? validationIssues : localValidationIssues;
    const issueByCartItemId = useMemo(
        () =>
            new Map<number, CartValidationIssue>(
                activeValidationIssues
                    .filter(
                        (issue): issue is CartValidationIssue & { cartItemId: number } =>
                            typeof issue.cartItemId === "number",
                    )
                    .map((issue) => [issue.cartItemId, issue]),
            ),
        [activeValidationIssues],
    );

    const cartStockMessage = useCallback(
        (issue: CartValidationIssue): string => {
            if (issue.reason === "unavailable") return t("cart.unavailable");
            if (issue.reason === "out_of_stock") return t("cart.outOfStock");
            if (issue.reason === "insufficient_stock") return t("cart.insufficientStock", issue.availableStock);
            return issue.productName;
        },
        [t],
    );

    const handleShow = useCallback(async () => {
        if (localValidationIssues.length > 0) {
            addToast(t("cart.checkoutNeedsUpdates"), getCartValidationMessage(localValidationIssues));
            return;
        }

        setIsValidatingCheckout(true);
        const valid = await validateBeforeCheckout();
        setIsValidatingCheckout(false);

        if (valid) {
            setShow(true);
        }
    }, [addToast, localValidationIssues, t, validateBeforeCheckout]);

    const handleClickPayment = useCallback(() => {
        if (activeValidationIssues.length > 0) {
            addToast(t("cart.checkoutNeedsUpdates"), getCartValidationMessage(activeValidationIssues));
            setShow(false);
            return;
        }
        togglePayment();
        setShow(false);
    }, [activeValidationIssues, addToast, t, togglePayment]);

    const handleRemoveCartItem = useCallback(
        (cartItemId: number) => {
            const item = cart.find((cartItem) => cartItem.cartItemId === cartItemId);
            if (item) removeItem(item);
        },
        [cart, removeItem],
    );

    const handleValidationRefresh = useCallback(
        (nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => {
            onValidationRefresh(nextCart, issues);
        },
        [onValidationRefresh],
    );

    if (isCartLoading && cart.length === 0) {
        return (
            <Layout>
                <LoadingScreen variant="page" />
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>{`${t("cart.title")} | Digital-E`}</title>
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
                                <h2>{t("cart.title")}</h2>
                            </div>
                            <div className="cart__header__summary">
                                <div>
                                    <strong>{cart.length}</strong>
                                    <span>{t("cart.itemsLabel")}</span>
                                </div>
                                <div>
                                    <strong>${subtotal.toFixed(2)}</strong>
                                    <span>{t("cart.estimatedTotal")}</span>
                                </div>
                            </div>
                        </header>

                        <main className="cart__layout">
                            <section className="cart__main">
                                <div className="cart__list-card">
                                    <div className="cart__list-header">
                                        <h3>{t("cart.itemsCount", cart.length)}</h3>
                                    </div>
                                    <div className="cart__list">
                                        {cart.length === 0 ? (
                                            <EmptyState
                                                className="cart__empty"
                                                icon={<CartIcon size={24} />}
                                                title={t("cart.empty")}
                                                actionLabel={t("common.shopNow")}
                                                actionTo="/shops"
                                            />
                                        ) : (
                                            cart.map((item) => (
                                                <CartItem
                                                    key={item.cartItemId}
                                                    item={item}
                                                    validationIssue={issueByCartItemId.get(item.cartItemId)}
                                                    handleQuantityChange={handleQuantityChange}
                                                    handleRemoveCartItem={handleRemoveCartItem}
                                                    translate={cartStockMessage}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="cart__actions">
                                    <button className="cart__action cart__action--ghost" onClick={() => navigate("/")}>
                                        <ArrowLeftIcon /> {t("cart.continueShopping")}
                                    </button>
                                    <button
                                        className="cart__action cart__action--primary"
                                        onClick={handleShow}
                                        disabled={cart.length === 0 || isValidatingCheckout}
                                    >
                                        {isValidatingCheckout ? t("cart.checkingStock") : t("cart.proceed")} <ArrowRightIcon />
                                    </button>
                                </div>
                                <div className="cart__support">
                                    {activeValidationIssues.length > 0 ? (
                                        <div className="cart__warning">
                                            <strong>{t("cart.checkoutNeedsUpdates")}</strong>
                                            <span>{getCartValidationMessage(activeValidationIssues)}</span>
                                            {activeValidationIssues.length > 1 ? (
                                                <small>{t("cart.itemsNeedAttention", activeValidationIssues.length)}</small>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <div className="cart__note">{t("cart.freeDeliveryNote")}</div>
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

                <Modal show={show} onHide={handleClose} animation={false} size="lg" dialogClassName="cart__confirm-modal">
                    <Modal.Header closeButton>
                        <Modal.Title>{t("cart.reviewOrder")}</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <div className="cart__confirm">
                            <div className="cart__confirm__summary">
                                <div className="cart__confirm__summary-header">
                                    <span className="cart__confirm__summary-label">{t("cart.orderSummary")}</span>
                                    <span className="cart__confirm__summary-count">{t("cart.itemsCount", cart.length)}</span>
                                </div>
                                <div className="cart__confirm__rows">
                                    <div className="cart__confirm__row">
                                        <span>{t("cart.merchandise")}</span>
                                        <strong>${totalPrice.toFixed(2)}</strong>
                                    </div>
                                    {discount > 0 ? (
                                        <div className="cart__confirm__row cart__confirm__row--discount">
                                            <span>{t("cart.discount")}</span>
                                            <strong>−${discount.toFixed(2)}</strong>
                                        </div>
                                    ) : null}
                                    <div className="cart__confirm__divider" />
                                    <div className="cart__confirm__row cart__confirm__row--total">
                                        <span>{t("cart.amountDue")}</span>
                                        <strong>${subtotal.toFixed(2)}</strong>
                                    </div>
                                </div>
                            </div>
                            <div className="cart__confirm__items">
                                <span className="cart__confirm__items-label">{t("cart.itemsInOrder")}</span>
                                <div className="cart__confirm__items-list">
                                    {cart.map((item) => (
                                        <div key={item.cartItemId} className="cart__confirm__item">
                                            <div className="cart__confirm__item-info">
                                                <strong className="cart__confirm__item-name">{item.productName}</strong>
                                                <span className="cart__confirm__item-meta">{item.brand} &middot; {item.category}</span>
                                            </div>
                                            <div className="cart__confirm__item-qty">&times;{item.quantity}</div>
                                            <div className="cart__confirm__item-price">${((item.sale_price || item.price) * item.quantity).toFixed(2)}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <p className="cart__confirm__footnote">{t("cart.footnote")}</p>
                        </div>
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="outline-secondary" onClick={handleClose}>
                            {t("cart.cancelOrder")}
                        </Button>
                        <Button variant="primary" size="lg" onClick={handleClickPayment}>
                            {t("cart.placeOrder", subtotal.toFixed(2))}
                        </Button>
                    </Modal.Footer>
                </Modal>
                <ConfirmActionModal
                    show={pendingRemoveItem !== null}
                    title={t("cart.remove")}
                    message={t("cart.removeConfirm", pendingRemoveItem?.productName || t("cart.empty").toLowerCase())}
                    confirmLabel={t("cart.remove")}
                    isConfirming={isRemovingItem}
                    onCancel={cancelRemoveItem}
                    onConfirm={confirmRemoveItem}
                />
            </Container>
        </Layout>
    );
};

export default CartPage;
