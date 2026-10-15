import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PAYMENT_METHOD } from "../constants";
import { CURRENCY_CODE } from "../../../constants/currency";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useCart } from "../../../context/CartContext";
import {
    ArrowRightIcon,
    BoxSeamIcon,
    CheckCircleIcon,
    ClipboardListIcon,
    EnvelopeIcon,
    ShieldIcon,
} from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import "../../../styles/features/orders/_checkout-success.scss";
import { formatUtcDateTime } from "../../../utils/dateTime";
import {
    cancelGuestPaymentAttempt,
    cancelPaymentAttempt,
    fetchCustomerCart,
    getGuestPaymentAttempt,
    getPaymentAttempt,
    lookupGuestOrder,
    reconcileGuestPaymentAttempt,
    reconcilePaymentAttempt,
    removeCustomerCartItem,
    syncGuestCart,
    updateCustomerCartItem,
} from "../api";
import { parseShippingAddress } from "../shippingAddress";
import { formatMoney } from "../../../utils/currency";
import { CUSTOMER_ROUTES } from "../../../routes/customerRoutes";
import type { GuestOrderDetail } from "../types";
import type { PaymentAttemptStatus } from "../types";
import { useT } from "../../../hooks/useT";
import { readGuestCart, replaceGuestCart } from "../guestCartStorage";
import ShipmentTimeline from "../../shipping/components/ShipmentTimeline";
import { fetchCustomerShipment, fetchGuestShipment } from "../../shipping/api";
import type { ShipmentSummary } from "../../shipping/types";
import {
    clearPendingCheckout,
    readCheckoutSuccess,
    maskPhoneNumber,
    type CheckoutSuccessData,
} from "./checkoutSuccessStorage";

const guestOrderToCheckoutSuccess = (order: GuestOrderDetail, guestOrderToken: string): CheckoutSuccessData => {
    const shipping = parseShippingAddress(order.shipping_address);
    const totalPrice = Number(order.total_price) || 0;
    const discount = Number(order.discount) || 0;
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

    return {
        orderId: String(order.id),
        totalPrice,
        discount,
        subtotal,
        shippingFee: Math.max(0, totalPrice - subtotal),
        itemsCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        placedAt: order.date_added,
        currency: order.currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND,
        paymentMethod: order.payment_method
            ? order.payment_method as CheckoutSuccessData["paymentMethod"]
            : undefined,
        email: order.guest_email || undefined,
        name: order.guest_name || undefined,
        address: shipping.address,
        city: shipping.city,
        country: shipping.country,
        phone: order.guest_phone ? maskPhoneNumber(order.guest_phone) : "",
        guestOrderToken,
    };
};

const CheckoutSuccessPage = () => {
    const { userData, loading } = useAuth();
    const { clearCart, fetchCart } = useCart();
    const t = useT();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const payOSOrderCode = searchParams.get("payos_order_code");
    const requestedAttemptId = searchParams.get("payment_attempt_id");
    const paymentAttemptId = requestedAttemptId;
    const routeData = (location.state as { checkoutSuccess?: CheckoutSuccessData } | null)?.checkoutSuccess || null;

    const orderData = useMemo(() => readCheckoutSuccess(), []);
    const guestOrderToken = orderData?.guestOrderToken;

    useEffect(() => {
        if (paymentAttemptId || payOSOrderCode) return;
        const confirmedCheckout = routeData || orderData;
        if (loading || !confirmedCheckout) return;

        sessionStorage.removeItem("checkoutSuccess");
        clearCart({ converted: Boolean(confirmedCheckout.guestOrderToken) });
        void fetchCart();
    }, [clearCart, fetchCart, loading, orderData, payOSOrderCode, paymentAttemptId, routeData]);

    const [copyStatus, setCopyStatus] = useState("Copy access token");
    const [showGuestToken, setShowGuestToken] = useState(false);
    const [shipment, setShipment] = useState<ShipmentSummary | null>(null);
    const [polledOrder, setPolledOrder] = useState<CheckoutSuccessData | null>(null);
    const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttemptStatus | null>(null);
    const [attemptError, setAttemptError] = useState<"auth" | "forbidden" | "notFound" | "offline" | "server" | null>(null);
    const [attemptChecking, setAttemptChecking] = useState(false);
    const [attemptPollingStopped, setAttemptPollingStopped] = useState(false);
    const [attemptCancelNotice, setAttemptCancelNotice] = useState<"orderExists" | "error" | null>(null);
    const [attemptRefresh, setAttemptRefresh] = useState(0);
    const paymentAttemptRef = useRef<PaymentAttemptStatus | null>(null);
    const attemptRequestInFlightRef = useRef(false);
    const attemptStartedAt = useRef(Date.now());
    const attemptHeadingRef = useRef<HTMLHeadingElement>(null);
    const focusedAttemptRef = useRef<string | null>(null);
    const cartAppliedAttemptRef = useRef<string | null>(null);

    const loadPaymentAttempt = useCallback(async () => {
        if (!paymentAttemptId) return;
        setAttemptChecking(true);
        setAttemptError(null);
        try {
            const result = userData?.id
                ? await getPaymentAttempt(paymentAttemptId)
                : await getGuestPaymentAttempt(paymentAttemptId);
            paymentAttemptRef.current = result;
            setPaymentAttempt(result);
        } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            setAttemptError(status === 401 ? "auth" : status === 403 ? "forbidden" : status === 404 ? "notFound" : !navigator.onLine ? "offline" : status && status >= 500 ? "server" : "offline");
        } finally {
            setAttemptChecking(false);
        }
    }, [paymentAttemptId, userData?.id]);

    useEffect(() => {
        if (!paymentAttemptId || loading) return;
        attemptStartedAt.current = Date.now();
        paymentAttemptRef.current = null;
        setPaymentAttempt(null);
        let disposed = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const terminal = (status: PaymentAttemptStatus | null) => Boolean(status && (
            (status.paymentState === "PAID" && status.orderState === "CREATED" && status.orderId !== null)
            || (["CANCELLED", "EXPIRED"].includes(status.paymentState) && status.orderState !== "CREATED")
            || status.resolutionState === "RESOLVED"
        ));
        const schedule = (delay: number) => {
            if (disposed || document.hidden || !navigator.onLine) return;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => void check(), delay);
        };
        const check = async () => {
            if (disposed || document.hidden || !navigator.onLine) return;
            if (attemptRequestInFlightRef.current) {
                schedule(500);
                return;
            }
            timer = undefined;
            if (Date.now() - attemptStartedAt.current >= 120_000 || terminal(paymentAttemptRef.current)) {
                setAttemptPollingStopped(true);
                return;
            }
            attemptRequestInFlightRef.current = true;
            setAttemptChecking(true);
            try {
                const result = userData?.id ? await getPaymentAttempt(paymentAttemptId) : await getGuestPaymentAttempt(paymentAttemptId);
                if (disposed) return;
                paymentAttemptRef.current = result;
                setPaymentAttempt(result);
                setAttemptError(null);
                if (!terminal(result)) {
                    const elapsed = Date.now() - attemptStartedAt.current;
                    const interval = elapsed < 30_000 ? 2_000 : 5_000;
                    schedule(Math.max(interval, Math.max(0, result.retryAfterSeconds || 0) * 1_000));
                } else {
                    setAttemptPollingStopped(true);
                }
            } catch (error) {
                if (!disposed) {
                    const status = (error as { response?: { status?: number } })?.response?.status;
                    setAttemptError(error instanceof TypeError ? "notFound" : status === 401 ? "auth" : status === 403 ? "forbidden" : status === 404 ? "notFound" : !navigator.onLine ? "offline" : status && status >= 500 ? "server" : "offline");
                    schedule(5_000);
                }
            } finally {
                attemptRequestInFlightRef.current = false;
                if (!disposed) setAttemptChecking(false);
            }
        };
        const resume = () => {
            if (!disposed && !document.hidden && navigator.onLine) {
                if (timer) clearTimeout(timer);
                timer = undefined;
                void check();
            }
        };
        document.addEventListener("visibilitychange", resume);
        window.addEventListener("online", resume);
        void check();
        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", resume);
            window.removeEventListener("online", resume);
        };
    }, [attemptRefresh, loading, paymentAttemptId, userData?.id]);

    useEffect(() => {
        if (!paymentAttemptId || focusedAttemptRef.current === paymentAttemptId) return;
        focusedAttemptRef.current = paymentAttemptId;
        attemptHeadingRef.current?.focus();
    }, [paymentAttemptId]);

    useEffect(() => {
        const orderId = Number(orderData?.orderId);
        const hasStoredContactDetails = Boolean(
            orderData?.email
            || orderData?.name
            || orderData?.address
            || orderData?.city
            || orderData?.country
            || orderData?.phone,
        );

        if (
            loading
            || routeData
            || !orderData?.guestOrderToken
            || hasStoredContactDetails
            || !Number.isSafeInteger(orderId)
            || orderId <= 0
        ) {
            return;
        }

        let cancelled = false;
        const hydrateGuestOrder = async () => {
            try {
                const order = await lookupGuestOrder(orderId, orderData.guestOrderToken!);
                if (!cancelled && order?.id) {
                    setPolledOrder(guestOrderToCheckoutSuccess(order, orderData.guestOrderToken!));
                }
            } catch {
                // Keep the safe summary if the token-protected lookup is unavailable.
            }
        };

        void hydrateGuestOrder();
        return () => {
            cancelled = true;
        };
    }, [loading, orderData, routeData]);

    useEffect(() => {
        if (!paymentAttemptId || !paymentAttempt || loading || paymentAttemptId !== paymentAttempt.attemptId
            || paymentAttempt.paymentState !== "PAID" || paymentAttempt.orderState !== "CREATED"
            || !paymentAttempt.orderId || cartAppliedAttemptRef.current === paymentAttemptId) return;
        cartAppliedAttemptRef.current = paymentAttemptId;
        const purchased = new Map<number, number>();
        for (const item of paymentAttempt.items) purchased.set(item.productId, (purchased.get(item.productId) || 0) + item.quantity);
        const updatePurchasedCart = async () => {
            if (userData?.id) {
                const current = await fetchCustomerCart(userData.id);
                for (const item of current) {
                    const bought = purchased.get(item.productId) || 0;
                    if (!bought) continue;
                    const remaining = Math.max(0, item.quantity - bought);
                    if (remaining > 0) await updateCustomerCartItem(userData.id, item.cartItemId, remaining);
                    else await removeCustomerCartItem(userData.id, item.cartItemId);
                }
            } else {
                const next = readGuestCart().flatMap((item) => {
                    const remaining = Math.max(0, item.quantity - (purchased.get(item.productId) || 0));
                    return remaining ? [{ ...item, quantity: remaining }] : [];
                });
                replaceGuestCart(next);
                await syncGuestCart(next);
            }
            await fetchCart();
            clearPendingCheckout();
        };
        void updatePurchasedCart().catch(() => { cartAppliedAttemptRef.current = null; });
    }, [fetchCart, loading, paymentAttempt, paymentAttemptId, userData?.id]);

    const combinedData = payOSOrderCode && !paymentAttemptId ? null : routeData || polledOrder || orderData;
    useEffect(() => {
        let active = true;
        const id = Number(combinedData?.orderId);
        if (!Number.isSafeInteger(id) || id <= 0) return () => { active = false; };
        const load = guestOrderToken
            ? fetchGuestShipment(id, guestOrderToken)
            : userData?.id ? fetchCustomerShipment(id) : Promise.resolve(null);
        void load.then((result) => { if (active) setShipment(result); }).catch(() => { if (active) setShipment(null); });
        return () => { active = false; };
    }, [combinedData?.orderId, guestOrderToken, userData?.id]);
    const isGuestOrder = Boolean(combinedData?.guestOrderToken || guestOrderToken);
    const paymentLabel =
        combinedData?.paymentMethod === PAYMENT_METHOD.CASH
              ? "Cash on delivery"
              : combinedData?.paymentMethod === PAYMENT_METHOD.PAYOS
                ? "PayOS (VND)"
                : "Payment method pending";
    const summaryCards = [
        { label: "Order ID", value: combinedData?.orderId || "Pending" },
        { label: "Order total", value: formatMoney(combinedData?.totalPrice ?? 0, combinedData?.currency) },
        { label: "Shipping", value: formatMoney(combinedData?.shippingFee ?? 0, combinedData?.currency) },
        { label: "Discount", value: formatMoney(combinedData?.discount ?? 0, combinedData?.currency) },
        { label: "Items", value: `${combinedData?.itemsCount ?? 0}` },
    ];
    const copyGuestToken = async () => {
        if (!combinedData?.guestOrderToken) return;
        try {
            await navigator.clipboard.writeText(combinedData.guestOrderToken);
            setCopyStatus("Copied");
        } catch {
            setCopyStatus("Copy failed");
        }
    };

    if (paymentAttemptId) {
        const confirmed = Boolean(paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "CREATED" && paymentAttempt.orderId);
        const titleKey = attemptError
            ? "attemptUnknownTitle"
            : confirmed
                ? "attemptConfirmedTitle"
                : paymentAttempt?.resolutionState === "REFUND_RECORDED"
                    ? "attemptRefundedTitle"
                    : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "FINALIZING"
                        ? "attemptPaidFinalizingTitle"
                        : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "REVIEW_REQUIRED"
                            ? "attemptReviewTitle"
                            : paymentAttempt?.paymentState === "PARTIAL"
                                ? "attemptPartialTitle"
                                : paymentAttempt?.paymentState === "MISMATCH"
                                    ? "attemptMismatchTitle"
                                    : paymentAttempt?.paymentState === "CANCELLED"
                                        ? "attemptCancelledTitle"
                                        : paymentAttempt?.paymentState === "EXPIRED"
                                            ? "attemptExpiredTitle"
                                            : paymentAttempt?.paymentState === "PENDING"
                                                ? "attemptPendingTitle"
                                                : "attemptUnknownTitle";
        const errorKey = attemptError ? `attemptError${attemptError[0].toUpperCase()}${attemptError.slice(1)}` : null;
        const bodyKey = confirmed
            ? "attemptConfirmed"
            : paymentAttempt?.resolutionState === "REFUND_RECORDED"
                ? "attemptRefundedBody"
                : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "REVIEW_REQUIRED"
                    ? "attemptPaidReviewBody"
                    : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "FINALIZING"
                        ? "attemptPaidFinalizingBody"
                        : paymentAttempt?.paymentState === "PARTIAL" || paymentAttempt?.paymentState === "MISMATCH"
                            ? "attemptSupportBody"
                            : paymentAttempt?.paymentState === "CANCELLED"
                                ? "attemptCancelledBody"
                                : paymentAttempt?.paymentState === "EXPIRED"
                                    ? "attemptExpiredBody"
                                    : paymentAttempt?.paymentState === "PENDING"
                                        ? "attemptPendingBody"
                                        : "attemptUnknownBody";
        const needsSupport = paymentAttempt && ["PARTIAL", "MISMATCH"].includes(paymentAttempt.paymentState);
        const checkAgain = async () => {
            attemptStartedAt.current = Date.now();
            setAttemptPollingStopped(false);
            setAttemptChecking(true);
            try {
                if (userData?.id) await reconcilePaymentAttempt(paymentAttemptId);
                else await reconcileGuestPaymentAttempt(paymentAttemptId);
            } catch {
                // The follow-up status request distinguishes access and service failures.
            } finally {
                setAttemptChecking(false);
                setAttemptRefresh((value) => value + 1);
            }
        };
        const cancelAttempt = async () => {
            try {
                if (userData?.id) await cancelPaymentAttempt(paymentAttemptId);
                else await cancelGuestPaymentAttempt(paymentAttemptId);
                setAttemptCancelNotice(null);
                await checkAgain();
            } catch (error) {
                setAttemptCancelNotice((error as { response?: { status?: number } })?.response?.status === 409 ? "orderExists" : "error");
                await loadPaymentAttempt();
            }
        };
        return (
            <Layout>
                <Helmet><title>{t(titleKey)} | Digital-E</title></Helmet>
                <main className="success app-page">
                    <section className="success__hero" aria-labelledby="payment-attempt-heading">
                        <div className="success__hero__content">
                            <div className="success__hero__title-row">
                                {confirmed ? <span className="success__hero__icon"><CheckCircleIcon size={34} /></span> : null}
                                <div>
                                    <h1 id="payment-attempt-heading" ref={attemptHeadingRef} tabIndex={-1}>{t(titleKey)}</h1>
                                    <p className="success__hero__greeting" role="status" aria-live="polite">{t(bodyKey)}</p>
                                </div>
                            </div>
                        </div>
                    </section>
                    <p className="checkout__note" role="status" aria-live="polite">
                        {attemptChecking ? t("attemptChecking") : errorKey ? t(errorKey) : attemptPollingStopped ? t("attemptRetryStopped") : !paymentAttempt ? t("attemptChecking") : ""}
                    </p>
                    {paymentAttempt ? (
                        <>
                        <section className="success__summary" aria-label={t("checkout.orderSummary")}>
                            {confirmed ? <article><span>{t("attemptOrderId")}</span><strong>{paymentAttempt.orderId}</strong></article> : null}
                            <article><span>{t("attemptItems")}</span><strong>{paymentAttempt.items.reduce((sum, item) => sum + item.quantity, 0)}</strong></article>
                            <article><span>{t("attemptSubtotal")}</span><strong>{formatMoney(paymentAttempt.subtotalVnd, paymentAttempt.currency)}</strong></article>
                            <article><span>{t("attemptDiscount")}</span><strong>{formatMoney(paymentAttempt.discountVnd, paymentAttempt.currency)}</strong></article>
                            <article><span>{t("attemptShipping")}</span><strong>{formatMoney(paymentAttempt.shippingVnd, paymentAttempt.currency)}</strong></article>
                            <article><span>{t("attemptTotal")}</span><strong>{formatMoney(paymentAttempt.payableVnd, paymentAttempt.currency)}</strong></article>
                            <article><span>{t("attemptReference")}</span><strong>{paymentAttempt.supportReference}</strong></article>
                            <article><span>{t("attemptExpires")}</span><strong>{formatUtcDateTime(paymentAttempt.expiresAt)}</strong></article>
                        </section>
                        <section className="success__summary" aria-label={t("attemptItems")}>
                            {paymentAttempt.items.map((item, index) => <article key={`${item.productId}-${index}`}><span>{item.name} × {item.quantity}</span><strong>{formatMoney(item.unitPriceVnd, paymentAttempt.currency)}</strong></article>)}
                        </section>
                        </>
                    ) : null}
                    {needsSupport ? <p role="status">{t("attemptReference")}: {paymentAttempt?.supportReference}</p> : null}
                    {attemptCancelNotice === "orderExists" ? <p role="alert">{t("attemptCancelOrderExists")} <Link to={userData?.id ? CUSTOMER_ROUTES.orders : "/guest-order"}>{t("attemptOpenOrders")}</Link></p> : null}
                    {attemptCancelNotice === "error" ? <p role="alert">{t("attemptCancelError")}</p> : null}
                    <div className="success__actions">
                        <button type="button" className="success__action success__action--primary" onClick={checkAgain} disabled={attemptChecking}>{attemptChecking ? t("attemptCheckingButton") : t("attemptCheckAgain")}</button>
                        {paymentAttempt?.resumeUrl && paymentAttempt.paymentState === "PENDING" ? <a className="success__action success__action--secondary" href={paymentAttempt.resumeUrl} rel="noopener noreferrer">{t("attemptResume")}</a> : null}
                        {paymentAttempt?.paymentState === "PENDING" && paymentAttempt.orderState !== "CREATED" ? <button type="button" className="success__action success__action--secondary" onClick={() => void cancelAttempt()}>{t("attemptCancel")}</button> : null}
                    </div>
                </main>
            </Layout>
        );
    }

    if (!combinedData) {
        return (
            <Layout>
                <Helmet><title>{t("attemptUnknownTitle")} | Digital-E</title></Helmet>
                <main className="success app-page">
                    <section className="success__hero" aria-labelledby="checkout-result-heading">
                        <div className="success__hero__content">
                            <h1 id="checkout-result-heading" tabIndex={-1}>{t("attemptUnknownTitle")}</h1>
                            <p>{payOSOrderCode ? t("attemptMissingReferenceBody") : t("attemptUnknownBody")}</p>
                        </div>
                    </section>
                    <div className="success__actions">
                        <Link to={userData?.id ? CUSTOMER_ROUTES.orders : "/guest-order"} className="success__action success__action--primary">{t("attemptOpenOrders")}</Link>
                        <Link to="/" className="success__action success__action--secondary">{t("continueShopping")}</Link>
                    </div>
                </main>
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>Order Confirmed | Digital-E</title>
                <meta
                    name="description"
                    content="Your order is confirmed. View shipping details and continue shopping on Digital-E."
                />
            </Helmet>
            <main className="success app-page">
                <article className="success__hero">
                    <div className="success__hero__content">
                        <div className="success__hero__title-row">
                            <span className="success__hero__icon">
                                <CheckCircleIcon size={34} />
                            </span>
                            <div>
                                <h1>{payOSOrderCode && !combinedData ? t("attemptUnknownTitle") : t("attemptConfirmedTitle")}</h1>
                                <p className="success__hero__greeting">
                                    Thank you {userData && !loading ? userData.username : "there"}.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="success__hero__meta">
                        <div>
                            <strong>{combinedData?.itemsCount ?? 0}</strong>
                            <span>Items secured</span>
                        </div>
                        <div>
                            <strong>{paymentLabel}</strong>
                            <span>Payment</span>
                        </div>
                        <div>
                            <strong>{combinedData?.placedAt ? formatUtcDateTime(combinedData.placedAt) : formatUtcDateTime()}</strong>
                            <span>Placed at</span>
                        </div>
                    </div>
                </article>

                <section className="success__summary" aria-label="Order summary">
                    {summaryCards.map((card) => (
                        <article key={card.label}>
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                        </article>
                    ))}
                </section>

                {isGuestOrder && combinedData?.guestOrderToken ? (
                    <section className="success__guest-access" aria-label="Guest order access">
                        <div>
                            <span className="success__guest-access__eyebrow">Guest order access</span>
                            <h2>Save these details to track your order</h2>
                            <p>Anyone with both values can view this order, so keep the access token private.</p>
                        </div>
                        <div className="success__guest-access__fields">
                            <label>
                                <span>Order ID</span>
                                <input readOnly value={combinedData.orderId} aria-label="Order ID" />
                            </label>
                            <label>
                                <span>Access token</span>
                                <input
                                    readOnly
                                    type={showGuestToken ? "text" : "password"}
                                    value={combinedData.guestOrderToken}
                                    aria-label="Guest order access token"
                                />
                            </label>
                            <div className="success__guest-access__actions">
                                <button
                                    type="button"
                                    onClick={() => setShowGuestToken((visible) => !visible)}
                                    aria-pressed={showGuestToken}
                                >
                                    {showGuestToken ? "Hide token" : "Reveal token"}
                                </button>
                                <button type="button" onClick={() => void copyGuestToken()}>{copyStatus}</button>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className="success__workflow" aria-label="What happens next">
                    <article>
                        <span>
                            <BoxSeamIcon size={18} />
                        </span>
                        <strong>Order processing</strong>
                        <p>Your items are queued for packing and shipment preparation.</p>
                    </article>
                    <article>
                        <span>
                            <EnvelopeIcon size={18} />
                        </span>
                        <strong>Confirmation details</strong>
                        <p>
                            {isGuestOrder
                                ? "Keep your order ID and access token below to check this order later."
                                : `Order updates will be sent to ${combinedData?.email || userData?.email || "your email"}.`}
                        </p>
                    </article>
                    <article>
                        <span>
                            <ShieldIcon size={18} />
                        </span>
                        <strong>Checkout verified</strong>
                        <p>Stock, quantities, and pricing were validated before your order was placed.</p>
                    </article>
                </section>

                <ShipmentTimeline shipment={shipment} />

                <section className="success__details">
                    <article className="success__card">
                        <div className="success__card__header">
                            <span>
                                <ClipboardListIcon size={18} />
                            </span>
                            <div>
                                <h2>Shipping details</h2>
                                <p>Delivery information captured for this order.</p>
                            </div>
                        </div>
                        <div className="success__detail-list">
                            <div>
                                <span>Recipient</span>
                                <strong>{combinedData?.name || "-"}</strong>
                            </div>
                            <div>
                                <span>Address</span>
                                <strong>{combinedData?.address || "-"}</strong>
                            </div>
                            <div>
                                <span>Location</span>
                                <strong>{[combinedData?.city, combinedData?.country].filter(Boolean).join(", ") || "-"}</strong>
                            </div>
                            <div>
                                <span>Phone</span>
                                <strong>{combinedData?.phone || "-"}</strong>
                            </div>
                        </div>
                    </article>

                    <article className="success__card">
                        <div className="success__card__header">
                            <span>
                                <EnvelopeIcon size={18} />
                            </span>
                            <div>
                                <h2>Contact and payment</h2>
                                <p>Reference details for support and follow-up.</p>
                            </div>
                        </div>
                        <div className="success__detail-list">
                            <div>
                                <span>Email</span>
                                <strong>{combinedData?.email || userData?.email || "-"}</strong>
                            </div>
                            <div>
                                <span>Placed on</span>
                                <strong>
                                    {combinedData?.placedAt ? formatUtcDateTime(combinedData.placedAt) : formatUtcDateTime()}
                                </strong>
                            </div>
                            <div>
                                <span>Payment method</span>
                                <strong>{paymentLabel}</strong>
                            </div>
                            <div>
                                <span>Subtotal</span>
                                <strong>{formatMoney(combinedData?.subtotal ?? combinedData?.totalPrice ?? 0, combinedData?.currency)}</strong>
                            </div>
                            <div>
                                <span>Shipping</span>
                                <strong>{formatMoney(combinedData?.shippingFee ?? 0, combinedData?.currency)}</strong>
                            </div>
                        </div>
                    </article>
                </section>

                <div className="success__actions">
                    <Link to="/" className="success__action success__action--primary">
                        Continue shopping <ArrowRightIcon size={18} />
                    </Link>
                    <Link to={isGuestOrder ? "/guest-order" : CUSTOMER_ROUTES.orders} className="success__action success__action--secondary">
                        {isGuestOrder ? "Look up guest order" : "View order status"}
                    </Link>
                </div>
            </main>
        </Layout>
    );
};

export default CheckoutSuccessPage;
