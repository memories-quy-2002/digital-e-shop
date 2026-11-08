import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trackStorefrontEvent } from "../../../lib/storefrontAnalytics";
import { Container } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AsideCart from "../../../components/common/AsideCart";
import CartItem from "../../../components/common/CartItem";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { ArrowLeftIcon, ArrowRightIcon, CartIcon } from "../../../components/common/Icons";
import LoadingScreen from "../../../components/common/LoadingScreen";
import Layout from "../../../components/layout/Layout";
import { useToast } from "../../../context/ToastContext";
import { useCart } from "../../../context/CartContext";
import type { CartValidationIssue, CheckoutCartItem } from "../types";
import { getCartValidationMessage } from "../types";
import "../../../styles/features/orders/_cart.scss";
import CheckoutPaymentPage from "../components/CheckoutPaymentPage";
import { useT } from "../../../hooks/useT";
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import { clearCheckoutDraft, hasCheckoutDraft } from "../checkoutDraft";

const CartPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { addToast } = useToast();
    const t = useT();
    const copy = useCustomerJourneyCopy();
    const {
        items: cart,
        totalPrice,
        discount,
        discountCode,
        subtotal,
        validationIssues,
        status: cartStatus,
        error: cartError,
        isLoading: isCartLoading,
        isRemovingItem,
        pendingRemoveItem,
        updateQuantity: contextUpdateQuantity,
        removeItem,
        confirmRemoveItem,
        cancelRemoveItem,
        applyDiscount,
        validateBeforeCheckout,
        fetchCart,
        onValidationRefresh,
        isGuest,
        hasGuestItems,
        mergeStatus,
        mergeGuestCart,
    } = useCart();
    const [isPayment, setIsPayment] = useState<boolean>(() => searchParams.get("payment") === "cancelled" && hasCheckoutDraft());
    const [isValidatingCheckout, setIsValidatingCheckout] = useState(false);
    const validatingCheckout = useRef(false);
    const blockedCheckout = useRef(false);

    useEffect(() => {
        if (searchParams.get("payment") === "cancelled") {
            if (!hasCheckoutDraft()) clearCheckoutDraft();
            const nextSearchParams = new URLSearchParams(searchParams);
            nextSearchParams.delete("payment");
            setSearchParams(nextSearchParams, { replace: true });
        } else {
            clearCheckoutDraft();
        }
    }, [searchParams, setSearchParams]);


    const handleQuantityChange = async (itemId: number, event: React.ChangeEvent<HTMLInputElement>) => {
        const item = cart.find((cartItem) => cartItem.cartItemId === itemId);
        if (!item) return;

        const requestedQuantity = Math.max(1, parseInt(event.target.value, 10) || 1);
        const availableStock = item.available_stock ?? item.stock;
        const newQuantity = Math.min(requestedQuantity, availableStock);
        if (requestedQuantity > availableStock) {
            addToast(
                t("cart.outOfStock"),
                `${t("cart.insufficientStock", availableStock).replace(/[.!]?$/, "")} (${item.productName}).`,
            );
        }

        await contextUpdateQuantity(itemId, newQuantity);
    };

    const localValidationIssues: CartValidationIssue[] = useMemo(
        () =>
            cart.flatMap((item): CartValidationIssue[] => {
                const availableStock = item.available_stock ?? item.stock;
                if (availableStock <= 0) {
                    return [
                        {
                            cartItemId: item.cartItemId,
                            productId: item.productId,
                            productName: item.productName,
                            requestedQuantity: item.quantity,
                            availableStock,
                            reason: "out_of_stock",
                        },
                    ];
                }
                if (item.quantity > availableStock) {
                    return [
                        {
                            cartItemId: item.cartItemId,
                            productId: item.productId,
                            productName: item.productName,
                            requestedQuantity: item.quantity,
                            availableStock,
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
        if (validatingCheckout.current) return;
        if (localValidationIssues.length > 0) {
            blockedCheckout.current = true;
            trackStorefrontEvent({ name: "Storefront Cart Validation", properties: { outcome: "blocked", reason: "stock", recovered: false } });
            addToast(t("cart.checkoutNeedsUpdates"), getCartValidationMessage(localValidationIssues));
            return;
        }

        validatingCheckout.current = true;
        setIsValidatingCheckout(true);
        try {
            const valid = await validateBeforeCheckout();
            trackStorefrontEvent({ name: "Storefront Cart Validation", properties: {
                outcome: valid ? "ready" : "blocked",
                reason: valid ? "none" : "validation",
                recovered: valid && blockedCheckout.current,
            } });
            blockedCheckout.current = !valid;
            if (valid) setIsPayment(true);
        } catch {
            blockedCheckout.current = true;
            trackStorefrontEvent({ name: "Storefront Cart Validation", properties: { outcome: "blocked", reason: "unavailable", recovered: false } });
            addToast(t("cart.loadErrorTitle"), t("cart.loadError"));
        } finally {
            validatingCheckout.current = false;
            setIsValidatingCheckout(false);
        }
    }, [addToast, localValidationIssues, t, validateBeforeCheckout]);

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

    const handleMergeGuestCart = useCallback(async () => {
        const result = await mergeGuestCart();
        if (result.complete) {
            addToast(t("cart.guestCart"), copy.cart.guestCartMergeSuccess);
        } else if (result.accepted.length > 0) {
            addToast(t("cart.guestCart"), t("cart.guestCartMergePartial"));
        }
    }, [addToast, copy, mergeGuestCart, t]);

    if (isCartLoading && cart.length === 0) {
        return (
            <Layout>
                <LoadingScreen variant="page" />
            </Layout>
        );
    }

    if (cartStatus === "error" && cart.length === 0) {
        return (
            <Layout>
                <Container fluid className="cart app-page">
                    <div className="cart__state cart__state--error" role="alert" aria-live="assertive">
                        <strong>{t("cart.loadErrorTitle")}</strong>
                        <p>{cartError || t("cart.loadError")}</p>
                        <button type="button" onClick={() => void fetchCart()} disabled={isCartLoading}>
                            {t("cart.retry")}
                        </button>
                    </div>
                </Container>
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>{`${t("cart.title")} | Digital-E`}</title>
                <meta name="description" content={copy.cart.metaDescription} />
            </Helmet>
            <Container fluid className="cart app-page">
                {cartStatus === "error" ? (
                    <div className="cart__state cart__state--error" role="alert" aria-live="assertive">
                        <strong>{t("cart.loadErrorTitle")}</strong>
                        <p>{cartError || t("cart.loadError")}</p>
                        <button type="button" onClick={() => void fetchCart()} disabled={isCartLoading}>
                            {t("cart.retry")}
                        </button>
                    </div>
                ) : null}
                {isPayment ? (
                    <CheckoutPaymentPage
                        setIsPayment={setIsPayment}
                        cart={cart}
                        totalPrice={totalPrice}
                        discount={discount}
                        discountCode={discountCode}
                        subtotal={subtotal}
                        validationIssues={activeValidationIssues}
                        onValidationRefresh={handleValidationRefresh}
                    />
                ) : (
                    <>
                        <header className="cart__header">
                            <div className="cart__header__copy">
                                {cart.length > 0 ? (
                                    <span className="cart__header__eyebrow">{t("cart.summaryEyebrow")}</span>
                                ) : null}
                                <h1>{t("cart.title")}</h1>
                                {cart.length > 0 ? <p>{t("cart.description")}</p> : null}
                            </div>
                        </header>

                        <div className={cart.length === 0 ? "cart__layout cart__layout--empty" : "cart__layout"}>
                            <section className={cart.length === 0 && isGuest && !hasGuestItems && activeValidationIssues.length === 0 ? "cart__main cart__main--empty" : "cart__main"}>
                                {cart.length === 0 ? (
                                    <section className="cart__empty" aria-labelledby="cart-empty-title">
                                        <span className="cart__empty-icon" aria-hidden="true">
                                            <CartIcon size={26} />
                                        </span>
                                        <h2 id="cart-empty-title">{t("cart.empty")}</h2>
                                        <p>{t("cart.emptyDescription")}</p>
                                        <Link to="/shops" className="cart__empty-action">
                                            {t("common.shopNow")}
                                            <ArrowRightIcon />
                                        </Link>
                                    </section>
                                ) : (
                                    <div className="cart__list-card">
                                        <div className="cart__list-header">
                                            <h3>{t("cart.itemsCount", cart.length)}</h3>
                                            <button type="button" className="cart__continue-shopping" onClick={() => navigate("/shops")}>
                                                <ArrowLeftIcon /> {t("cart.continueShopping")}
                                            </button>
                                        </div>
                                        <div className="cart__list">
                                            {cart.map((item) => (
                                                <CartItem
                                                    key={item.cartItemId}
                                                    item={item}
                                                    validationIssue={issueByCartItemId.get(item.cartItemId)}
                                                    handleQuantityChange={handleQuantityChange}
                                                    handleRemoveCartItem={handleRemoveCartItem}
                                                    translate={cartStockMessage}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {((!isGuest && hasGuestItems) || activeValidationIssues.length > 0) ? (
                                    <div className="cart__support">
                                        {!isGuest && hasGuestItems ? (
                                            <div className="cart__warning" role="region" aria-label={t("cart.guestCart")}>
                                                <strong>{t("cart.guestCartTitle")}</strong>
                                                <span>{t("cart.guestCartDescription")}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleMergeGuestCart()}
                                                    disabled={mergeStatus === "loading"}
                                                >
                                                    {mergeStatus === "loading" ? t("cart.mergingGuestCart") : t("cart.mergeGuestCart")}
                                                </button>
                                                {mergeStatus === "partial" ? <small>{t("cart.guestCartMergePartial")}</small> : null}
                                            </div>
                                        ) : null}
                                        {activeValidationIssues.length > 0 ? (
                                            <div className="cart__warning">
                                                <strong>{t("cart.checkoutNeedsUpdates")}</strong>
                                                <span>{getCartValidationMessage(activeValidationIssues)}</span>
                                                {activeValidationIssues.length > 1 ? (
                                                    <small>{t("cart.itemsNeedAttention", activeValidationIssues.length)}</small>
                                                ) : null}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : null}
                            </section>

                            {cart.length > 0 ? (
                                <aside className="cart__sidebar">
                                    <AsideCart
                                        itemCount={cart.length}
                                        totalPrice={totalPrice}
                                        discount={discount}
                                        subtotal={subtotal}
                                        applyDiscount={applyDiscount}
                                        onCheckout={handleShow}
                                        isCheckoutDisabled={activeValidationIssues.length > 0}
                                        isCheckingOut={isValidatingCheckout}
                                    />
                                </aside>
                            ) : null}
                        </div>
                        {cart.length > 0 ? (
                            <div className="cart__mobile-checkout">
                                <button
                                    type="button"
                                    className="cart__action cart__action--primary"
                                    onClick={handleShow}
                                    disabled={isValidatingCheckout || activeValidationIssues.length > 0}
                                >
                                    {isValidatingCheckout ? t("cart.checkingStock") : t("cart.proceed")}
                                    <ArrowRightIcon />
                                </button>
                            </div>
                        ) : null}
                    </>
                )}

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
