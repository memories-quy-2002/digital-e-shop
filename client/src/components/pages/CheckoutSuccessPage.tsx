import React, { useMemo } from "react";
import { FiCheckCircle } from "react-icons/fi";
import { useAuth } from "../../context/AuthContext";
import "../../styles/CheckoutSuccessPage.scss";
import NavigationBar from "../common/NavigationBar";
import Layout from "../layout/Layout";

type CheckoutSuccessData = {
    orderId: string;
    totalPrice: number;
    discount: number;
    subtotal: number;
    email: string;
    name: string;
    address: string;
    city: string;
    country: string;
    phone: string;
    itemsCount: number;
    placedAt: string;
};

const CheckoutSuccessPage = () => {
    const { userData, loading } = useAuth();
    const orderData = useMemo(() => {
        try {
            const stored = sessionStorage.getItem("checkoutSuccess");
            return stored ? (JSON.parse(stored) as CheckoutSuccessData) : null;
        } catch {
            return null;
        }
    }, []);
    return (
        <Layout>
            <NavigationBar />
            <article className="success__container">
                <div className="success__container__icon">
                    <FiCheckCircle size={90} color="#22c55e" />
                </div>
                <p className="success__container__eyebrow">
                    Thank you {userData && !loading ? userData.username : "there"}!
                </p>
                <strong className="success__container__title">Your order is confirmed</strong>
                <p className="success__container__subtitle">
                    We’re preparing your items. A confirmation email will be sent shortly.
                </p>

                <section className="success__container__summary">
                    <div>
                        <span>Order ID</span>
                        <strong>{orderData?.orderId || "Pending"}</strong>
                    </div>
                    <div>
                        <span>Total</span>
                        <strong>${(orderData?.totalPrice ?? 0).toFixed(2)}</strong>
                    </div>
                    <div>
                        <span>Discount</span>
                        <strong>${(orderData?.discount ?? 0).toFixed(2)}</strong>
                    </div>
                    <div>
                        <span>Items</span>
                        <strong>{orderData?.itemsCount ?? 0}</strong>
                    </div>
                </section>

                <section className="success__container__details">
                    <div>
                        <h4>Shipping details</h4>
                        <p>{orderData?.name || "—"}</p>
                        <p>{orderData?.address || "—"}</p>
                        <p>
                            {[orderData?.city, orderData?.country].filter(Boolean).join(", ") || "—"}
                        </p>
                        <p>{orderData?.phone || "—"}</p>
                    </div>
                    <div>
                        <h4>Contact</h4>
                        <p>{orderData?.email || userData?.email || "—"}</p>
                        <p>
                            Placed on{" "}
                            {orderData?.placedAt
                                ? new Date(orderData.placedAt).toLocaleString("en-GB")
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
