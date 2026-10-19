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
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import { readGuestCart, replaceGuestCart } from "../guestCartStorage";
import ShipmentTimeline from "../../shipping/components/ShipmentTimeline";
import GuestOrderAccessCard from "../components/GuestOrderAccessCard";
import { fetchCustomerShipment, fetchGuestShipment } from "../../shipping/api";
import type { ShipmentSummary } from "../../shipping/types";
import { parseOrderIdentifier } from "../identifiers";
import {
    clearPendingCheckout,
    readCheckoutSuccess,
    readPendingCheckout,
    maskPhoneNumber,
    writeCheckoutSuccess,
    type CheckoutSuccessData,
} from "./checkoutSuccessStorage";

const guestOrderToCheckoutSuccess = (order: GuestOrderDetail, guestOrderToken: string): CheckoutSuccessData => {
    const shipping = parseShippingAddress(order.shipping_address);
    const totalPrice = Number(order.total_price) || 0;
    const discount = Number(order.discount) || 0;
    const subtotal = order.items.reduce((sum, item) => sum + Number(item.totalPrice || 0), 0);

    return {
        orderId: order.public_id ?? String(order.id),
        internalOrderId: order.id,
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
    const copy = useCustomerJourneyCopy();
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const payOSOrderCode = searchParams.get("payos_order_code");
    const requestedAttemptId = searchParams.get("payment_attempt_id");
    const paymentAttemptId = requestedAttemptId;
    const routeData = (location.state as { checkoutSuccess?: CheckoutSuccessData } | null)?.checkoutSuccess || null;

    const orderData = useMemo(() => readCheckoutSuccess(), []);
    const pendingCheckout = useMemo(() => readPendingCheckout(), []);
    const guestOrderToken = orderData?.guestOrderToken || pendingCheckout?.guestOrderToken;

    useEffect(() => {
        if (paymentAttemptId || payOSOrderCode) return;
        const confirmedCheckout = routeData || orderData;
        if (loading || !confirmedCheckout) return;

        sessionStorage.removeItem("checkoutSuccess");
        clearCart({ converted: Boolean(confirmedCheckout.guestOrderToken) });
        void fetchCart();
    }, [clearCart, fetchCart, loading, orderData, payOSOrderCode, paymentAttemptId, routeData]);

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
        const orderId = orderData?.orderId ? parseOrderIdentifier(orderData.orderId) : null;
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
            || orderId === null
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
                if (guestOrderToken && paymentAttempt.orderId) {
                    writeCheckoutSuccess({
                        orderId: String(paymentAttempt.orderId),
                        totalPrice: paymentAttempt.payableVnd,
                        discount: paymentAttempt.discountVnd,
                        subtotal: paymentAttempt.subtotalVnd,
                        shippingFee: paymentAttempt.shippingVnd,
                        itemsCount: paymentAttempt.items.reduce((sum, item) => sum + item.quantity, 0),
                        currency: paymentAttempt.currency,
                        paymentMethod: PAYMENT_METHOD.PAYOS,
                        guestOrderToken,
                    });
                }
            }
            await fetchCart();
            clearPendingCheckout();
        };
        void updatePurchasedCart().catch(() => { cartAppliedAttemptRef.current = null; });
    }, [fetchCart, guestOrderToken, loading, paymentAttempt, paymentAttemptId, userData?.id]);

    useEffect(() => {
        if (!paymentAttemptId || !paymentAttempt || userData?.id || !guestOrderToken
            || paymentAttempt.paymentState !== "PAID" || paymentAttempt.orderState !== "CREATED"
            || !paymentAttempt.orderId) return;
        let cancelled = false;
        void lookupGuestOrder(paymentAttempt.orderId, guestOrderToken).then((order) => {
            if (cancelled || !order?.id) return;
            const success = guestOrderToCheckoutSuccess(order, guestOrderToken);
            setPolledOrder(success);
            writeCheckoutSuccess(success);
            clearPendingCheckout();
        }).catch(() => {
            // Keep the attempt summary and the saved access card available if detail lookup is temporarily unavailable.
        });
        return () => { cancelled = true; };
    }, [guestOrderToken, paymentAttempt, paymentAttemptId, userData?.id]);

    const combinedData = payOSOrderCode && !paymentAttemptId ? null : routeData || polledOrder || orderData;
    useEffect(() => {
        let active = true;
        const id = combinedData?.internalOrderId ?? (combinedData?.orderId ? Number(combinedData.orderId) : NaN);
        if (!Number.isSafeInteger(id) || id <= 0) return () => { active = false; };
        const load = guestOrderToken
            ? fetchGuestShipment(id, guestOrderToken)
            : userData?.id ? fetchCustomerShipment(id) : Promise.resolve(null);
        void load.then((result) => { if (active) setShipment(result); }).catch(() => { if (active) setShipment(null); });
        return () => { active = false; };
    }, [combinedData?.internalOrderId, combinedData?.orderId, guestOrderToken, userData?.id]);
    const isGuestOrder = Boolean(combinedData?.guestOrderToken || guestOrderToken);
    const paymentLabel =
        combinedData?.paymentMethod === PAYMENT_METHOD.CASH
              ? t("checkout.cashOnDelivery")
              : combinedData?.paymentMethod === PAYMENT_METHOD.PAYOS
                ? t("checkout.payos")
                : t("checkoutSuccess.paymentMethodPending");
    const summaryCards = [
        { label: t("checkoutSuccess.orderId"), value: combinedData?.orderId || t("checkoutSuccess.pending") },
        {
            label: t("checkoutSuccess.amountDue"),
            value: formatMoney(Math.max((combinedData?.totalPrice ?? 0) - (combinedData?.discount ?? 0), 0), combinedData?.currency),
        },
        { label: t("checkoutSuccess.shipping"), value: formatMoney(combinedData?.shippingFee ?? 0, combinedData?.currency) },
        { label: t("checkoutSuccess.discount"), value: formatMoney(combinedData?.discount ?? 0, combinedData?.currency) },
        { label: t("checkoutSuccess.items"), value: `${combinedData?.itemsCount ?? 0}` },
    ];
    if (paymentAttemptId) {
        const confirmed = Boolean(paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "CREATED" && paymentAttempt.orderId);
        const titleKey = attemptError
            ? "checkout.attemptUnknownTitle"
            : confirmed
                ? "checkout.attemptPaymentSuccessTitle"
                : paymentAttempt?.resolutionState === "REFUND_RECORDED"
                    ? "checkout.attemptRefundedTitle"
                    : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "FINALIZING"
                        ? "checkout.attemptPaidFinalizingTitle"
                        : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "REVIEW_REQUIRED"
                            ? "checkout.attemptReviewTitle"
                            : paymentAttempt?.paymentState === "PARTIAL"
                                ? "checkout.attemptPartialTitle"
                                : paymentAttempt?.paymentState === "MISMATCH"
                                    ? "checkout.attemptMismatchTitle"
                                    : paymentAttempt?.paymentState === "CANCELLED"
                                        ? "checkout.attemptCancelledTitle"
                                        : paymentAttempt?.paymentState === "EXPIRED"
                                            ? "checkout.attemptExpiredTitle"
                                            : paymentAttempt?.paymentState === "PENDING"
                                                ? "checkout.attemptPendingTitle"
                                                : "checkout.attemptUnknownTitle";
        const errorKey = attemptError ? `checkout.attemptError${attemptError[0].toUpperCase()}${attemptError.slice(1)}` : null;
        const bodyKey = confirmed
            ? "checkout.attemptConfirmed"
            : paymentAttempt?.resolutionState === "REFUND_RECORDED"
                ? "checkout.attemptRefundedBody"
                : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "REVIEW_REQUIRED"
                    ? "checkout.attemptPaidReviewBody"
                    : paymentAttempt?.paymentState === "PAID" && paymentAttempt.orderState === "FINALIZING"
                        ? "checkout.attemptPaidFinalizingBody"
                        : paymentAttempt?.paymentState === "PARTIAL" || paymentAttempt?.paymentState === "MISMATCH"
                            ? "checkout.attemptSupportBody"
                            : paymentAttempt?.paymentState === "CANCELLED"
                                ? "checkout.attemptCancelledBody"
                                : paymentAttempt?.paymentState === "EXPIRED"
                                    ? "checkout.attemptExpiredBody"
                                    : paymentAttempt?.paymentState === "PENDING"
                                        ? "checkout.attemptPendingBody"
                                        : "checkout.attemptUnknownBody";
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
        const statusMessage = attemptChecking
            ? t("checkout.attemptChecking")
            : errorKey
                ? t(errorKey)
                : attemptPollingStopped
                    ? t("checkout.attemptRetryStopped")
                    : !paymentAttempt
                        ? t("checkout.attemptChecking")
                        : "";
        const resumeUrl = paymentAttempt?.resumeUrl && paymentAttempt.paymentState === "PENDING" ? paymentAttempt.resumeUrl : null;
        const canResume = Boolean(resumeUrl);
        const canCancel = paymentAttempt?.paymentState === "PENDING" && paymentAttempt.orderState !== "CREATED";
        return (
            <Layout>
                <Helmet>
                    <title>{t(titleKey)} | Digital-E</title>
                    <meta name="description" content={copy.checkoutSuccess.paymentAttemptDescription} />
                </Helmet>
                <main className="success success--attempt app-page" data-payment-state={paymentAttempt?.paymentState.toLowerCase() ?? "unknown"}>
                    <section className="success__attempt-hero" aria-labelledby="payment-attempt-heading">
                        <div className="success__attempt-status">
                            <span className="success__attempt-icon" aria-hidden="true">
                                {confirmed ? <CheckCircleIcon size={26} /> : <ShieldIcon size={24} />}
                            </span>
                            <div className="success__attempt-copy">
                                <h1 id="payment-attempt-heading" ref={attemptHeadingRef} tabIndex={-1}>{t(titleKey)}</h1>
                                <p>{t(bodyKey)}</p>
                            </div>
                        </div>
                        {paymentAttempt ? (
                            <div className="success__attempt-total">
                                <span>{t("checkout.attemptTotal")}</span>
                                <strong>{formatMoney(paymentAttempt.payableVnd, paymentAttempt.currency)}</strong>
                            </div>
                        ) : null}
                    </section>
                    {statusMessage ? <p className="success__attempt-message" role="status" aria-live="polite">{statusMessage}</p> : null}
                    {paymentAttempt ? (
                        <div className="success__attempt-content">
                            <section className="success__attempt-panel" aria-label={t("checkout.orderSummary")}>
                                <div className="success__attempt-panel-heading">
                                    <h2>{t("checkout.orderSummary")}</h2>
                                    <span>{t("checkout.attemptItems")}: {paymentAttempt.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
                                </div>
                                <dl className="success__attempt-breakdown">
                                    <div><dt>{t("checkout.attemptSubtotal")}</dt><dd>{formatMoney(paymentAttempt.subtotalVnd, paymentAttempt.currency)}</dd></div>
                                    <div><dt>{t("checkout.attemptDiscount")}</dt><dd>{formatMoney(paymentAttempt.discountVnd, paymentAttempt.currency)}</dd></div>
                                    <div><dt>{t("checkout.attemptShipping")}</dt><dd>{formatMoney(paymentAttempt.shippingVnd, paymentAttempt.currency)}</dd></div>
                                </dl>
                                <dl className="success__attempt-meta">
                                    {confirmed ? <div><dt>{t("checkout.attemptOrderId")}</dt><dd>{paymentAttempt.orderId}</dd></div> : null}
                                    <div><dt>{t("checkout.attemptReference")}</dt><dd>{paymentAttempt.supportReference}</dd></div>
                                    <div><dt>{t("checkout.attemptExpires")}</dt><dd>{formatUtcDateTime(paymentAttempt.expiresAt)}</dd></div>
                                </dl>
                            </section>
                            <section className="success__attempt-panel success__attempt-products" aria-label={t("checkout.attemptItems")}>
                                <h2>{t("checkout.attemptItems")}</h2>
                                <ul>
                                    {paymentAttempt.items.map((item, index) => (
                                        <li key={`${item.productId}-${index}`}>
                                            <span>{item.name}<small>× {item.quantity}</small></span>
                                            <strong>{formatMoney(item.unitPriceVnd * item.quantity, paymentAttempt.currency)}</strong>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                    ) : null}
                    {confirmed && !userData?.id && paymentAttempt?.orderId && guestOrderToken ? (
                        <GuestOrderAccessCard orderId={polledOrder?.orderId || String(paymentAttempt.orderId)} guestOrderToken={guestOrderToken} />
                    ) : null}
                    {attemptCancelNotice === "orderExists" ? <p className="success__attempt-message" role="alert">{t("checkout.attemptCancelOrderExists")} <Link to={userData?.id ? CUSTOMER_ROUTES.orders : "/guest-order"}>{t("checkout.attemptOpenOrders")}</Link></p> : null}
                    {attemptCancelNotice === "error" ? <p className="success__attempt-message" role="alert">{t("checkout.attemptCancelError")}</p> : null}
                    <div className="success__attempt-actions">
                        {confirmed && userData?.id && paymentAttempt?.orderId ? (
                            <Link
                                to={`${CUSTOMER_ROUTES.orders}?order=${encodeURIComponent(paymentAttempt.orderId)}`}
                                className="success__attempt-action success__attempt-action--primary"
                            >
                                {t("checkout.attemptOrderDetail")}
                            </Link>
                        ) : null}
                        {resumeUrl ? <a className="success__attempt-action success__attempt-action--primary" href={resumeUrl} rel="noopener noreferrer">{t("checkout.attemptResume")}</a> : null}
                        <button type="button" className={`success__attempt-action ${canResume ? "success__attempt-action--secondary" : "success__attempt-action--primary"}`} onClick={checkAgain} disabled={attemptChecking}>{attemptChecking ? t("checkout.attemptCheckingButton") : t("checkout.attemptCheckAgain")}</button>
                        {canCancel ? <button type="button" className="success__attempt-action success__attempt-action--danger" onClick={() => void cancelAttempt()}>{t("checkout.attemptCancel")}</button> : null}
                    </div>
                </main>
            </Layout>
        );
    }

    if (!combinedData) {
        return (
            <Layout>
                <Helmet>
                    <title>{t("checkout.attemptUnknownTitle")} | Digital-E</title>
                    <meta name="description" content={copy.checkoutSuccess.paymentAttemptDescription} />
                </Helmet>
                <main className="success success--attempt app-page">
                    <section className="success__attempt-hero" aria-labelledby="checkout-result-heading">
                        <div className="success__attempt-status">
                            <span className="success__attempt-icon" aria-hidden="true"><ShieldIcon size={24} /></span>
                            <div className="success__attempt-copy">
                                <h1 id="checkout-result-heading" tabIndex={-1}>{t("checkout.attemptUnknownTitle")}</h1>
                                <p>{payOSOrderCode ? t("checkout.attemptMissingReferenceBody") : t("checkout.attemptUnknownBody")}</p>
                            </div>
                        </div>
                    </section>
                    <div className="success__attempt-actions">
                        <Link to={userData?.id ? CUSTOMER_ROUTES.orders : "/guest-order"} className="success__attempt-action success__attempt-action--primary">{t("checkout.attemptOpenOrders")}</Link>
                        <Link to="/" className="success__attempt-action success__attempt-action--secondary">{t("continueShopping")}</Link>
                    </div>
                </main>
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>{t("checkoutSuccess.title")} | Digital-E</title>
                <meta
                    name="description"
                    content={t("checkoutSuccess.description")}
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
                                <h1>{payOSOrderCode && !combinedData ? t("checkout.attemptUnknownTitle") : t("checkout.attemptConfirmedTitle")}</h1>
                                <p className="success__hero__greeting">
                                    {t("checkoutSuccess.thankYou", userData && !loading ? userData.username : t("checkoutSuccess.there"))}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="success__hero__meta">
                        <div>
                            <strong>{combinedData?.itemsCount ?? 0}</strong>
                            <span>{t("checkoutSuccess.itemsSecured")}</span>
                        </div>
                        <div>
                            <strong>{paymentLabel}</strong>
                            <span>{t("checkoutSuccess.payment")}</span>
                        </div>
                        {combinedData?.placedAt ? (
                            <div>
                                <strong>{formatUtcDateTime(combinedData.placedAt)}</strong>
                                <span>{t("checkoutSuccess.placedAt")}</span>
                            </div>
                        ) : null}
                    </div>
                </article>

                <section className="success__summary" aria-label={t("checkoutSuccess.orderSummary")}>
                    {summaryCards.map((card) => (
                        <article key={card.label}>
                            <span>{card.label}</span>
                            <strong>{card.value}</strong>
                        </article>
                    ))}
                </section>

                {isGuestOrder && combinedData?.guestOrderToken ? (
                    <GuestOrderAccessCard orderId={combinedData.orderId} guestOrderToken={combinedData.guestOrderToken} />
                ) : null}

                <section className="success__workflow" aria-label={t("checkoutSuccess.whatHappensNext")}>
                    <article>
                        <span>
                            <BoxSeamIcon size={18} />
                        </span>
                        <strong>{t("checkoutSuccess.orderProcessing")}</strong>
                        <p>{t("checkoutSuccess.orderProcessingDescription")}</p>
                    </article>
                    <article>
                        <span>
                            <EnvelopeIcon size={18} />
                        </span>
                        <strong>{t("checkoutSuccess.confirmationDetails")}</strong>
                        <p>
                            {isGuestOrder
                                ? t("checkoutSuccess.guestConfirmationDetails")
                                : t("checkoutSuccess.orderUpdates", combinedData?.email || userData?.email || t("checkoutSuccess.emailFallback"))}
                        </p>
                    </article>
                    <article>
                        <span>
                            <ShieldIcon size={18} />
                        </span>
                        <strong>{t("checkoutSuccess.checkoutVerified")}</strong>
                        <p>{t("checkoutSuccess.checkoutVerifiedDescription")}</p>
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
                                <h2>{t("checkoutSuccess.shippingDetails")}</h2>
                                <p>{t("checkoutSuccess.shippingDetailsDescription")}</p>
                            </div>
                        </div>
                        <div className="success__detail-list">
                            <div>
                                <span>{t("checkoutSuccess.recipient")}</span>
                                <strong>{combinedData?.name || "-"}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.address")}</span>
                                <strong>{combinedData?.address || "-"}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.location")}</span>
                                <strong>{[combinedData?.city, combinedData?.country].filter(Boolean).join(", ") || "-"}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.phone")}</span>
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
                                <h2>{t("checkoutSuccess.contactAndPayment")}</h2>
                                <p>{t("checkoutSuccess.contactAndPaymentDescription")}</p>
                            </div>
                        </div>
                        <div className="success__detail-list">
                            <div>
                                <span>{t("checkoutSuccess.email")}</span>
                                <strong>{combinedData?.email || userData?.email || "-"}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.placedOn")}</span>
                                <strong>
                                    {combinedData?.placedAt ? formatUtcDateTime(combinedData.placedAt) : formatUtcDateTime()}
                                </strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.paymentMethod")}</span>
                                <strong>{paymentLabel}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.subtotal")}</span>
                                <strong>{formatMoney(combinedData?.subtotal ?? combinedData?.totalPrice ?? 0, combinedData?.currency)}</strong>
                            </div>
                            <div>
                                <span>{t("checkoutSuccess.shipping")}</span>
                                <strong>{formatMoney(combinedData?.shippingFee ?? 0, combinedData?.currency)}</strong>
                            </div>
                        </div>
                    </article>
                </section>

                <div className="success__actions">
                    <Link to="/" className="success__action success__action--primary">
                        {t("checkoutSuccess.continueShopping")} <ArrowRightIcon size={18} />
                    </Link>
                    <Link to={isGuestOrder ? "/guest-order" : CUSTOMER_ROUTES.orders} className="success__action success__action--secondary">
                        {isGuestOrder ? t("checkoutSuccess.lookupGuestOrder") : t("checkoutSuccess.viewOrderStatus")}
                    </Link>
                </div>
            </main>
        </Layout>
    );
};

export default CheckoutSuccessPage;
