import React, { useEffect, useState } from "react";
import { HISTORICAL_PAYMENT_METHOD, PAYMENT_METHOD } from "../constants";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../../components/layout/Layout";
import { ArrowRightIcon, SearchIcon } from "../../../components/common/Icons";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { lookupGuestOrder, requestGuestOrderAccessRecovery, verifyGuestOrderAccessRecovery } from "../api";
import type { GuestOrderDetail } from "../types";
import { maskPhoneNumber } from "./checkoutSuccessStorage";
import { parseShippingAddress } from "../shippingAddress";
import "../../../styles/features/orders/_guest-order.scss";
import { useT } from "../../../hooks/useT";
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import { formatMoney } from "../../../utils/currency";
import { getOrderStatusKey } from "../orderStatus";
import GuestAfterSalesPanel from "../../after-sales/components/GuestAfterSalesPanel";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { CURRENCY_CODE } from "../../../constants/currency";
import ShipmentTimeline from "../../shipping/components/ShipmentTimeline";
import { fetchGuestShipment } from "../../shipping/api";
import type { ShipmentSummary } from "../../shipping/types";
import GuestOrderAccessCard from "../components/GuestOrderAccessCard";

const getErrorMessage = (error: unknown, fallback: string) => {
    return getApiErrorMessage(error, fallback);
};

const getStatusLabel = (status: number, labels: { pending: string; done: string; canceled: string; unknown: string }) => {
    return labels[getOrderStatusKey(status)];
};

const GuestOrderLookupPage = () => {
    const t = useT();
    const copy = useCustomerJourneyCopy();
    const [searchParams] = useSearchParams();
    const [orderId, setOrderId] = useState(searchParams.get("orderId") || "");
    const [guestOrderToken, setGuestOrderToken] = useState("");
    const [order, setOrder] = useState<GuestOrderDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [invalidField, setInvalidField] = useState<"orderId" | "token" | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [shipment, setShipment] = useState<ShipmentSummary | null>(null);
    const [recoveryOpen, setRecoveryOpen] = useState(false);
    const [recoveryRequested, setRecoveryRequested] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState("");
    const [recoveryCode, setRecoveryCode] = useState("");
    const [recoveryBusy, setRecoveryBusy] = useState(false);
    const [recoveryError, setRecoveryError] = useState<string | null>(null);
    const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
    const getPaymentLabel = (paymentMethod?: string | null) => {
        if (paymentMethod === HISTORICAL_PAYMENT_METHOD.BANK_TRANSFER) return copy.guestOrder.historicalBankTransfer;
        if (paymentMethod === PAYMENT_METHOD.CASH) return t("checkout.cashOnDelivery");
        if (paymentMethod === PAYMENT_METHOD.PAYOS) return t("checkout.payos");
        if (paymentMethod === HISTORICAL_PAYMENT_METHOD.CARD) return copy.guestOrder.historicalCardPayment;
        return t("orders.paymentMethodPending");
    };

    useEffect(() => {
        const queryOrderId = searchParams.get("orderId");
        if (queryOrderId) setOrderId(queryOrderId);
    }, [searchParams]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError(null);
        setInvalidField(null);
        setOrder(null);
        setShipment(null);

        const numericOrderId = Number(orderId.trim());
        if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) {
            setInvalidField("orderId");
            return;
        }
        const normalizedToken = guestOrderToken.trim();
        if (!normalizedToken) {
            setInvalidField("token");
            return;
        }

        setIsLoading(true);
        try {
            const result = await lookupGuestOrder(numericOrderId, normalizedToken);
            setOrder(result);
            try { setShipment(await fetchGuestShipment(numericOrderId, normalizedToken)); } catch { setShipment(null); }
        } catch (lookupError) {
            setError(getErrorMessage(lookupError, t("guestOrder.notFound")));
        } finally {
            setIsLoading(false);
        }
    };

    const getRecoveryOrderId = () => {
        const numericOrderId = Number(orderId.trim());
        if (!Number.isSafeInteger(numericOrderId) || numericOrderId <= 0) {
            setRecoveryError(t("guestOrder.recoveryRequestError"));
            return null;
        }
        return numericOrderId;
    };

    const handleRecoveryRequest = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRecoveryError(null);
        setRecoveryMessage(null);
        const numericOrderId = getRecoveryOrderId();
        if (!numericOrderId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recoveryEmail.trim())) {
            setRecoveryError(t("guestOrder.recoveryRequestError"));
            return;
        }
        setRecoveryBusy(true);
        try {
            await requestGuestOrderAccessRecovery(numericOrderId, recoveryEmail.trim());
        } catch {
            // The same response is shown for unknown orders and transient request failures.
        } finally {
            setRecoveryRequested(true);
            setRecoveryMessage(t("guestOrder.recoveryRequestGeneric"));
            setRecoveryBusy(false);
        }
    };

    const handleRecoveryVerify = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setRecoveryError(null);
        const numericOrderId = getRecoveryOrderId();
        if (!numericOrderId || !/^\d{6}$/.test(recoveryCode)) {
            setRecoveryError(t("guestOrder.recoveryVerifyError"));
            return;
        }
        setRecoveryBusy(true);
        try {
            const { guestOrderToken: recoveredToken } = await verifyGuestOrderAccessRecovery(
                numericOrderId,
                recoveryEmail.trim(),
                recoveryCode,
            );
            setGuestOrderToken(recoveredToken);
            setRecoveryOpen(false);
            setRecoveryMessage(null);
            setError(null);
            const result = await lookupGuestOrder(numericOrderId, recoveredToken);
            setOrder(result);
            try { setShipment(await fetchGuestShipment(numericOrderId, recoveredToken)); } catch { setShipment(null); }
        } catch {
            setRecoveryError(t("guestOrder.recoveryVerifyError"));
        } finally {
            setRecoveryBusy(false);
        }
    };

    const shipping = order ? parseShippingAddress(order.shipping_address) : null;

    return (
        <Layout>
            <Helmet>
                <title>{copy.guestOrder.metaTitle}</title>
                <meta name="description" content={copy.guestOrder.metaDescription} />
            </Helmet>
            <main className="guest-order app-page">
                <section className="guest-order__hero">
                    <span className="guest-order__eyebrow">{t("guestOrder.eyebrow")}</span>
                    <h1>{t("guestOrder.title")}</h1>
                    <p>{t("guestOrder.description")}</p>
                </section>

                <section className="guest-order__lookup" aria-label={copy.guestOrder.formAriaLabel}>
                    <form onSubmit={handleSubmit} noValidate>
                        <label>
                            <span>{t("guestOrder.orderId")}</span>
                            <input
                                type="text"
                                name="orderId"
                                inputMode="numeric"
                                value={orderId}
                                aria-invalid={invalidField === "orderId"}
                                aria-describedby={invalidField === "orderId" ? "guest-order-id-error" : undefined}
                                onChange={(event) => {
                                    setOrderId(event.target.value);
                                    if (invalidField === "orderId") setInvalidField(null);
                                }}
                                autoComplete="off"
                                required
                            />
                            {invalidField === "orderId" ? (
                                <span id="guest-order-id-error" className="guest-order__field-error" role="alert">
                                    {t("guestOrder.validOrderId")}
                                </span>
                            ) : null}
                        </label>
                        <label>
                            <span>{t("guestOrder.accessToken")}</span>
                            <input
                                type="password"
                                name="guestOrderToken"
                                value={guestOrderToken}
                                aria-invalid={invalidField === "token"}
                                aria-describedby={invalidField === "token" ? "guest-order-token-error" : undefined}
                                onChange={(event) => {
                                    setGuestOrderToken(event.target.value);
                                    if (invalidField === "token") setInvalidField(null);
                                }}
                                autoComplete="off"
                                spellCheck={false}
                                required
                            />
                            {invalidField === "token" ? (
                                <span id="guest-order-token-error" className="guest-order__field-error" role="alert">
                                    {t("guestOrder.tokenRequired")}
                                </span>
                            ) : null}
                        </label>
                        {error ? <div className="guest-order__error" role="alert">{error}</div> : null}
                        <button type="submit" disabled={isLoading}>
                            <SearchIcon size={18} />
                            {isLoading ? t("guestOrder.loading") : t("guestOrder.submit")}
                        </button>
                    </form>
                    <button
                        type="button"
                        className="guest-order__recovery-toggle"
                        aria-expanded={recoveryOpen}
                        onClick={() => {
                            setRecoveryOpen((open) => !open);
                            setRecoveryError(null);
                            setRecoveryMessage(null);
                        }}
                    >
                        {t("guestOrder.recoverAccess")}
                    </button>
                    {recoveryOpen ? (
                        <div className="guest-order__recovery">
                            <form onSubmit={handleRecoveryRequest}>
                                <label>
                                    <span>{t("guestOrder.recoveryEmail")}</span>
                                    <input
                                        type="email"
                                        autoComplete="email"
                                        value={recoveryEmail}
                                        onChange={(event) => setRecoveryEmail(event.target.value)}
                                        required
                                    />
                                </label>
                                <button type="submit" disabled={recoveryBusy}>{t("guestOrder.sendRecoveryCode")}</button>
                            </form>
                            {recoveryRequested ? (
                                <form onSubmit={handleRecoveryVerify}>
                                    <label>
                                        <span>{t("guestOrder.recoveryCode")}</span>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            value={recoveryCode}
                                            onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                                            required
                                        />
                                    </label>
                                    <button type="submit" disabled={recoveryBusy}>{t("guestOrder.verifyRecoveryCode")}</button>
                                </form>
                            ) : null}
                        </div>
                    ) : null}
                    {recoveryMessage ? <p role="status" aria-live="polite">{recoveryMessage}</p> : null}
                    {recoveryError ? <p className="guest-order__error" role="alert">{recoveryError}</p> : null}
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
                                done: t("guestOrder.statusDone"),
                                canceled: t("guestOrder.statusCanceled"),
                                unknown: t("guestOrder.statusUnknown"),
                            })}</strong>
                        </div>

                        <div className="guest-order__summary">
                            <div><span>{t("guestOrder.payment")}</span><strong>{getPaymentLabel(order.payment_method)}</strong></div>
                            <div><span>{t("guestOrder.total")}</span><strong>{formatMoney(order.total_price, order.currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND)}</strong></div>
                            <div><span>{t("guestOrder.discount")}</span><strong>{formatMoney(order.discount, order.currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND)}</strong></div>
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
                                            <strong>{formatMoney(item.totalPrice, order.currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND)}</strong>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        </div>
                        <ShipmentTimeline shipment={shipment} />
                        <GuestAfterSalesPanel orderId={order.id} guestOrderToken={guestOrderToken} currency={order.currency} items={order.items} returnEligibleUntil={order.return_eligible_until} />
                    </section>
                ) : null}

                {order && guestOrderToken ? <GuestOrderAccessCard orderId={String(order.id)} guestOrderToken={guestOrderToken} /> : null}

                <Link to="/" className="guest-order__back">
                    {t("guestOrder.continueShopping")} <ArrowRightIcon size={18} />
                </Link>
            </main>
        </Layout>
    );
};

export default GuestOrderLookupPage;
