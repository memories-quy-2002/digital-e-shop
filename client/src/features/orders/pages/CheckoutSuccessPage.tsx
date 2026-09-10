import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import http from "../../../lib/http";
import { fetchGuestOrderByPayOSOrderCode, fetchGuestOrderBySession, lookupGuestOrder } from "../api";
import { parseShippingAddress } from "../shippingAddress";
import { formatMoney } from "../../../utils/currency";
import type { GuestOrderDetail } from "../types";
import {
    clearPendingCheckout,
    readCheckoutSuccess,
    readPendingCheckout,
    maskPhoneNumber,
    type CheckoutSuccessData,
} from "./checkoutSuccessStorage";

const guestOrderToCheckoutSuccess = (order: GuestOrderDetail, guestOrderToken: string): CheckoutSuccessData => {
    const shipping = parseShippingAddress(order.shipping_address);
    const totalPrice = Number(order.total_price) || 0;
    const discount = Number(order.discount) || 0;

    return {
        orderId: String(order.id),
        totalPrice,
        discount,
        subtotal: Math.max(0, totalPrice - discount),
        itemsCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        placedAt: order.date_added,
        currency: order.currency === "USD" ? "USD" : "VND",
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
    const location = useLocation();
    const [searchParams] = useSearchParams();
    const sessionId = searchParams.get("session_id");
    const payOSOrderCode = searchParams.get("payos_order_code");
    const routeData = (location.state as { checkoutSuccess?: CheckoutSuccessData } | null)?.checkoutSuccess || null;

    const orderData = useMemo(() => readCheckoutSuccess(), []);
    const pendingCheckout = useMemo(() => readPendingCheckout(), []);
    const guestOrderToken = orderData?.guestOrderToken || pendingCheckout?.guestOrderToken;

    useEffect(() => {
        const confirmedCheckout = routeData || orderData;
        if (loading || !confirmedCheckout) return;

        sessionStorage.removeItem("checkoutSuccess");
        clearCart();
        void fetchCart();
    }, [clearCart, fetchCart, loading, orderData, routeData]);

    const [polledOrder, setPolledOrder] = useState<CheckoutSuccessData | null>(null);
    const [pollingTimedOut, setPollingTimedOut] = useState(false);
    const [copyStatus, setCopyStatus] = useState("Copy access token");
    const [showGuestToken, setShowGuestToken] = useState(false);

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

    const pollForOrder = useCallback(async (id: string, provider: "stripe" | "payos") => {
        const pending = pendingCheckout;

        for (let attempt = 0; attempt < 7; attempt += 1) {
            try {
                const order = provider === "payos"
                    ? guestOrderToken
                        ? await fetchGuestOrderByPayOSOrderCode(Number(id), guestOrderToken)
                        : (await http.get(`/api/orders/by-payos-order-code/${encodeURIComponent(id)}`)).data?.order
                    : guestOrderToken
                        ? await fetchGuestOrderBySession(id, guestOrderToken)
                        : (await http.get(`/api/orders/by-session/${id}`)).data?.order;
                if (order?.id) {
                    const checkoutData = guestOrderToken
                        ? guestOrderToCheckoutSuccess(order, guestOrderToken)
                        : {
                            orderId: String(order.id),
                            totalPrice: pending?.totalPrice ?? 0,
                            discount: pending?.discount ?? 0,
                            subtotal: pending?.subtotal ?? pending?.totalPrice ?? 0,
                            itemsCount: pending?.itemsCount ?? 0,
                            placedAt: order.date_added,
                            paymentMethod: pending?.paymentMethod || (provider === "payos" ? "payos" : "card"),
                            email: pending?.email,
                            name: pending?.name,
                            address: pending?.address,
                            city: pending?.city,
                            country: pending?.country,
                            phone: pending?.phone,
                        };
                    setPolledOrder(checkoutData);
                    clearCart();
                    void fetchCart();
                    clearPendingCheckout();
                    return;
                }
            } catch {
                // 404 while the webhook hasn't landed yet — keep polling.
            }
            await new Promise((resolve) => setTimeout(resolve, 1500));
        }
        setPollingTimedOut(true);
    }, [clearCart, fetchCart, guestOrderToken, pendingCheckout]);

    useEffect(() => {
        const providerReference = payOSOrderCode || sessionId;
        const provider = payOSOrderCode ? "payos" : "stripe";
        if (providerReference && !routeData && !orderData && !loading) {
            pollForOrder(providerReference, provider);
        }
    }, [loading, orderData, payOSOrderCode, pollForOrder, routeData, sessionId]);

    const combinedData = routeData || polledOrder || orderData;
    const isGuestOrder = Boolean(combinedData?.guestOrderToken || guestOrderToken);
    const paymentLabel =
        combinedData?.paymentMethod === "bank_transfer"
            ? "Bank transfer"
            : combinedData?.paymentMethod === "cash"
              ? "Cash on delivery"
              : combinedData?.paymentMethod === "payos"
                ? "PayOS (VND)"
              : combinedData?.paymentMethod === "card" || combinedData?.paymentMethod === "stripe"
                ? "Card"
                : "Payment method pending";
    const summaryCards = [
        { label: "Order ID", value: combinedData?.orderId || "Pending" },
        { label: "Order total", value: formatMoney(combinedData?.totalPrice ?? 0, combinedData?.currency) },
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
                {(sessionId || payOSOrderCode) && !combinedData && !pollingTimedOut ? (
                    <div className="checkout__note">Confirming your payment...</div>
                ) : null}
                {(sessionId || payOSOrderCode) && !combinedData && pollingTimedOut ? (
                    <div className="checkout__alert">
                        Payment received — we&apos;re finalizing your order. Check{" "}
                        {isGuestOrder ? <Link to="/guest-order">Guest order lookup</Link> : <Link to="/orders">My Orders</Link>} shortly if it doesn&apos;t appear here.
                    </div>
                ) : null}
                <article className="success__hero">
                    <div className="success__hero__content">
                        <div className="success__hero__title-row">
                            <span className="success__hero__icon">
                                <CheckCircleIcon size={34} />
                            </span>
                            <div>
                                <h1>Order confirmed</h1>
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
                        </div>
                    </article>
                </section>

                <div className="success__actions">
                    <Link to="/" className="success__action success__action--primary">
                        Continue shopping <ArrowRightIcon size={18} />
                    </Link>
                    <Link to={isGuestOrder ? "/guest-order" : "/orders"} className="success__action success__action--secondary">
                        {isGuestOrder ? "Look up guest order" : "View order status"}
                    </Link>
                </div>
            </main>
        </Layout>
    );
};

export default CheckoutSuccessPage;
