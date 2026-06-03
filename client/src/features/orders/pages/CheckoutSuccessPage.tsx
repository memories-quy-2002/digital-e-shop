import React, { useEffect, useMemo } from "react";
import { Helmet } from "react-helmet";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
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

type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    itemsCount: number;
    placedAt: string;
    paymentMethod?: "bank_transfer" | "cash";
    email?: string;
    name?: string;
    address?: string;
    city?: string;
    country?: string;
    phone?: string;
};

const CheckoutSuccessPage = () => {
    const { userData, loading } = useAuth();
    const location = useLocation();
    const routeData = (location.state as { checkoutSuccess?: CheckoutSuccessData } | null)?.checkoutSuccess || null;

    const orderData = useMemo(() => {
        try {
            const stored = sessionStorage.getItem("checkoutSuccess");
            return stored ? (JSON.parse(stored) as CheckoutSuccessData) : null;
        } catch {
            return null;
        }
    }, []);

    useEffect(() => {
        if (orderData) {
            sessionStorage.removeItem("checkoutSuccess");
        }
    }, [orderData]);

    const combinedData = routeData || orderData;
    const paymentLabel =
        combinedData?.paymentMethod === "bank_transfer"
            ? "Bank transfer"
            : combinedData?.paymentMethod === "cash"
              ? "Cash on delivery"
              : "Payment method pending";
    const summaryCards = [
        { label: "Order ID", value: combinedData?.orderId || "Pending" },
        { label: "Order total", value: `$${(combinedData?.totalPrice ?? 0).toFixed(2)}` },
        { label: "Discount", value: `$${(combinedData?.discount ?? 0).toFixed(2)}` },
        { label: "Items", value: `${combinedData?.itemsCount ?? 0}` },
    ];

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
                        <span className="success__hero__eyebrow">Order confirmed</span>
                        <div className="success__hero__title-row">
                            <span className="success__hero__icon">
                                <CheckCircleIcon size={34} />
                            </span>
                            <div>
                                <p className="success__hero__greeting">
                                    Thank you {userData && !loading ? userData.username : "there"}.
                                </p>
                                <h1>Your order is confirmed</h1>
                            </div>
                        </div>
                        <p className="success__hero__subtitle">
                            We&apos;re preparing your items now. Shipping updates and order activity will appear in your
                            account shortly.
                        </p>
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
                        <p>Order updates will be sent to {combinedData?.email || userData?.email || "your email"}.</p>
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
                                <strong>${(combinedData?.subtotal ?? combinedData?.totalPrice ?? 0).toFixed(2)}</strong>
                            </div>
                        </div>
                    </article>
                </section>

                <div className="success__actions">
                    <Link to="/" className="success__action success__action--primary">
                        Continue shopping <ArrowRightIcon size={18} />
                    </Link>
                    <Link to="/orders" className="success__action success__action--secondary">
                        View order status
                    </Link>
                </div>
            </main>
        </Layout>
    );
};

export default CheckoutSuccessPage;
