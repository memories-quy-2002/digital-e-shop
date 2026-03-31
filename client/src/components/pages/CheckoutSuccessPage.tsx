import React, { useEffect, useMemo } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/CheckoutSuccessPage.scss";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    itemsCount: number;
    placedAt: string;
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

    return (
        <Layout>
            <Helmet>
                <title>Order Confirmed | Digital-E</title>
                <meta
                    name="description"
                    content="Your order is confirmed. View shipping details and continue shopping on Digital-E."
                />
            </Helmet>
            <article className="success__container">
                <div className="success__container__icon">
                    <FiCheckCircle size={90} color="#22c55e" />
                </div>
                <p className="success__container__eyebrow">
                    Thank you {userData && !loading ? userData.username : "there"}!
                </p>
                <strong className="success__container__title">Your order is confirmed</strong>
                <p className="success__container__subtitle">
                    We&apos;re preparing your items. A confirmation email will be sent shortly.
                </p>

                <section className="success__container__summary">
                    <div>
                        <span>Order ID</span>
                        <strong>{combinedData?.orderId || "Pending"}</strong>
                    </div>
                    <div>
                        <span>Total</span>
                        <strong>${(combinedData?.totalPrice ?? 0).toFixed(2)}</strong>
                    </div>
                    <div>
                        <span>Discount</span>
                        <strong>${(combinedData?.discount ?? 0).toFixed(2)}</strong>
                    </div>
                    <div>
                        <span>Items</span>
                        <strong>{combinedData?.itemsCount ?? 0}</strong>
                    </div>
                </section>

                <section className="success__container__details">
                    <div>
                        <h4>Shipping details</h4>
                        <p>{combinedData?.name || "—"}</p>
                        <p>{combinedData?.address || "—"}</p>
                        <p>{[combinedData?.city, combinedData?.country].filter(Boolean).join(", ") || "—"}</p>
                        <p>{combinedData?.phone || "—"}</p>
                    </div>
                    <div>
                        <h4>Contact</h4>
                        <p>{combinedData?.email || userData?.email || "—"}</p>
                        <p>
                            Placed on{" "}
                            {combinedData?.placedAt
                                ? new Date(combinedData.placedAt).toLocaleString("en-GB")
                                : new Date().toLocaleString("en-GB")}
                        </p>
                    </div>
                </section>

                <div className="success__container__buttons">
                    <a href="/" className="primary">
                        Continue shopping
                    </a>
                    <a href="/orders" className="secondary">
                        View order status
                    </a>
                </div>
            </article>
        </Layout>
    );
};

export default CheckoutSuccessPage;
