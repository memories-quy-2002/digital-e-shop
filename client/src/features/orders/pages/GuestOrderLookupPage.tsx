import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../../components/layout/Layout";
import { ArrowRightIcon, SearchIcon } from "../../../components/common/Icons";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { lookupGuestOrder } from "../api";
import type { GuestOrderDetail } from "../types";
import { maskPhoneNumber } from "./checkoutSuccessStorage";
import { parseShippingAddress } from "../shippingAddress";
import "../../../styles/features/orders/_guest-order.scss";
import { useT } from "../../../hooks/useT";
import { formatMoney } from "../../../utils/currency";

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === "object" && "response" in error) {
        const response = (error as { response?: { data?: { msg?: string } } }).response;
        return response?.data?.msg || fallback;
    }
    return fallback;
};

const getStatusLabel = (status: number, labels: { pending: string; processing: string; completed: string }) => {
    if (status === 2) return labels.completed;
    if (status === 1) return labels.processing;
    return labels.pending;
};

const getPaymentLabel = (paymentMethod?: string | null) => {
    if (paymentMethod === "bank_transfer") return "Bank transfer";
    if (paymentMethod === "cash") return "Cash on delivery";
    if (paymentMethod === "payos") return "PayOS (VND)";
    if (paymentMethod === "card" || paymentMethod === "stripe") return "Card";
    return "Payment method pending";
};

const GuestOrderLookupPage = () => {
    const t = useT();
    const [searchParams] = useSearchParams();
    const [orderId, setOrderId] = useState(searchParams.get("orderId") || "");
    const [guestOrderToken, setGuestOrderToken] = useState("");
    const [order, setOrder] = useState<GuestOrderDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const queryOrderId = searchParams.get("orderId");
        if (queryOrderId) setOrderId(queryOrderId);
    }, [searchParams]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setOrder(null);

        const numericOrderId = Number(orderId.trim());
        if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) {
            setError(t("guestOrder.validOrderId"));
            return;
        }
        const normalizedToken = guestOrderToken.trim();
        if (!normalizedToken) {
            setError(t("guestOrder.tokenRequired"));
            return;
        }

        setIsLoading(true);
        try {
            setOrder(await lookupGuestOrder(numericOrderId, normalizedToken));
        } catch (lookupError) {
            setError(getErrorMessage(lookupError, t("guestOrder.notFound")));
        } finally {
            setIsLoading(false);
        }
    };

    const shipping = order ? parseShippingAddress(order.shipping_address) : null;

    return (
        <Layout>
            <Helmet>
                <title>Guest Order Lookup | Digital-E</title>
                <meta name="description" content="Look up a Digital-E guest order with its order ID and access token." />
            </Helmet>
            <main className="guest-order app-page">
                <section className="guest-order__hero">
                    <span className="guest-order__eyebrow">{t("guestOrder.eyebrow")}</span>
                    <h1>{t("guestOrder.title")}</h1>
                    <p>{t("guestOrder.description")}</p>
                </section>

                <section className="guest-order__lookup" aria-label="Guest order lookup form">
                    <form onSubmit={handleSubmit} noValidate>
                        <label>
                            <span>{t("guestOrder.orderId")}</span>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={orderId}
                                onChange={(event) => setOrderId(event.target.value)}
                                autoComplete="off"
                                required
                            />
                        </label>
                        <label>
                            <span>{t("guestOrder.accessToken")}</span>
                            <input
                                type="password"
                                value={guestOrderToken}
                                onChange={(event) => setGuestOrderToken(event.target.value)}
                                autoComplete="off"
                                required
                            />
                        </label>
                        {error ? <div className="guest-order__error" role="alert">{error}</div> : null}
                        <button type="submit" disabled={isLoading}>
                            <SearchIcon size={18} />
                            {isLoading ? t("guestOrder.loading") : t("guestOrder.submit")}
                        </button>
                    </form>
                </section>

                {order && shipping ? (
                    <section className="guest-order__result" aria-live="polite">
                        <div className="guest-order__result-header">
                            <div>
                                <span className="guest-order__eyebrow">{t("guestOrder.orderId")} #{order.id}</span>
                                <h2>{order.guest_name || t("guestOrder.guestCustomer")}</h2>
                                <p>{t("guestOrder.placed")} {formatUtcDateTime(order.date_added)}</p>
                            </div>
                            <strong className="guest-order__status">{getStatusLabel(order.status, {
                                pending: t("guestOrder.statusPending"),
                                processing: t("guestOrder.statusProcessing"),
                                completed: t("guestOrder.statusCompleted"),
                            })}</strong>
                        </div>

                        <div className="guest-order__summary">
                            <div><span>{t("guestOrder.payment")}</span><strong>{getPaymentLabel(order.payment_method)}</strong></div>
                            <div><span>{t("guestOrder.total")}</span><strong>{formatMoney(order.total_price, order.currency === "USD" ? "USD" : "VND")}</strong></div>
                            <div><span>{t("guestOrder.discount")}</span><strong>{formatMoney(order.discount, order.currency === "USD" ? "USD" : "VND")}</strong></div>
                            <div><span>{t("guestOrder.email")}</span><strong>{order.guest_email || "-"}</strong></div>
                        </div>

                        <div className="guest-order__details">
                            <article>
                                <h3>{t("guestOrder.shipping")}</h3>
                                <p>{shipping.address || "-"}</p>
                                <p>{[shipping.city, shipping.country].filter(Boolean).join(", ") || "-"}</p>
                                <p>{order.guest_phone ? maskPhoneNumber(order.guest_phone) : "-"}</p>
                            </article>
                            <article>
                                <h3>{t("guestOrder.items")}</h3>
                                <ul>
                                    {order.items.map((item) => (
                                        <li key={`${item.productId}-${item.productName}`}>
                                            <span>{item.productName} x{item.quantity}</span>
                                            <strong>{formatMoney(item.totalPrice, order.currency === "USD" ? "USD" : "VND")}</strong>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        </div>
                    </section>
                ) : null}

                <Link to="/" className="guest-order__back">
                    {t("guestOrder.continueShopping")} <ArrowRightIcon size={18} />
                </Link>
            </main>
        </Layout>
    );
};

export default GuestOrderLookupPage;
