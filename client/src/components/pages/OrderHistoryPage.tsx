import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useSearchParams } from "react-router-dom";
import {
    CustomerOrder,
    CustomerOrderDetail,
    addItemsToCustomerCart,
    fetchCustomerOrderDetail,
    fetchCustomerOrders,
} from "../../api/customerAccount";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import Layout from "../layout/Layout";
import CustomerAccountShell from "../common/account/CustomerAccountShell";
import { CartIcon } from "../common/Icons";
import "../../styles/OrderHistoryPage.scss";
import { formatUtcDate, formatUtcDateTime } from "../../utils/dateTime";

const getStatusLabel = (status: number) => {
    if (status === 1) return "Done";
    if (status === 0) return "Pending";
    return "Canceled";
};

const getPaymentLabel = (payment?: CustomerOrder["payment_method"]) => {
    if (payment === "bank_transfer") return "Bank transfer";
    if (payment === "cash") return "Cash on delivery";
    return "Not recorded";
};

const formatCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const OrderHistoryPage = () => {
    const { userData } = useAuth();
    const [searchParams] = useSearchParams();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [orderDetail, setOrderDetail] = useState<CustomerOrderDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);

    useEffect(() => {
        const fetchOrders = async () => {
            if (!uid) return;

            try {
                setOrders(await fetchCustomerOrders(uid));
            } catch {
                addToast("Orders", "Unable to load order history.");
            }
        };

        fetchOrders();
    }, [addToast, uid]);

    useEffect(() => {
        const fetchDetail = async () => {
            if (!selectedOrderId) {
                setOrderDetail(null);
                return;
            }

            try {
                setLoadingDetail(true);
                setOrderDetail(await fetchCustomerOrderDetail(selectedOrderId));
            } catch {
                addToast("Orders", "Unable to load order detail.");
            } finally {
                setLoadingDetail(false);
            }
        };

        fetchDetail();
    }, [addToast, selectedOrderId]);

    const selectedOrder = useMemo(
        () => orders.find((order) => order.id === selectedOrderId) || orders[0] || null,
        [orders, selectedOrderId],
    );

    useEffect(() => {
        if (!selectedOrderId && orders.length > 0) {
            const requestedOrderId = Number(searchParams.get("order"));
            const requestedOrder = orders.find((order) => order.id === requestedOrderId);
            setSelectedOrderId(requestedOrder?.id || orders[0].id);
        }
    }, [orders, searchParams, selectedOrderId]);

    const handleReorder = async () => {
        if (!uid || !orderDetail) return;

        const availableItems = orderDetail.items.filter((item) => item.stock > 0);
        if (availableItems.length === 0) {
            addToast("Reorder", "None of the items in this order are currently available.");
            return;
        }

        try {
            await addItemsToCustomerCart(uid, availableItems);
            addToast("Reorder", "Available items were added to your cart.");
        } catch {
            addToast("Reorder", "Unable to add the order items to your cart.");
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>Order History | Digital-E</title>
                <meta name="description" content="Review previous orders and reorder available items." />
            </Helmet>
            <main className="order-history">
                <CustomerAccountShell
                    eyebrow="Orders"
                    title="Order history"
                    description="Track previous purchases, check payment details, and reorder available products."
                />

                {orders.length === 0 ? (
                    <section className="order-history__empty">
                        <h2>No orders yet</h2>
                        <p>Your completed checkout history will appear here.</p>
                    </section>
                ) : (
                    <section className="order-history__layout">
                        <div className="order-history__list">
                            {orders.map((order) => (
                                <button
                                    key={order.id}
                                    type="button"
                                    className={selectedOrder?.id === order.id ? "is-active" : ""}
                                    onClick={() => setSelectedOrderId(order.id)}
                                >
                                    <strong>Order #{order.id}</strong>
                                    <span>{formatUtcDate(order.date_added)}</span>
                                    <small>{formatCurrency(Math.max(order.total_price - order.discount, 0))}</small>
                                </button>
                            ))}
                        </div>

                        <aside className="order-history__detail">
                            {loadingDetail ? (
                                <p>Loading order...</p>
                            ) : orderDetail ? (
                                <>
                                    <div className="order-history__detail__header">
                                        <div>
                                            <span className={`order-history__pill status-${orderDetail.status}`}>
                                                {getStatusLabel(orderDetail.status)}
                                            </span>
                                            <h2>Order #{orderDetail.id}</h2>
                                            <p>{formatUtcDateTime(orderDetail.date_added)}</p>
                                        </div>
                                        <button type="button" onClick={handleReorder}>
                                            <CartIcon size={18} />
                                            Reorder
                                        </button>
                                    </div>

                                    <div className="order-history__meta">
                                        <div>
                                            <span>Payment</span>
                                            <strong>{getPaymentLabel(orderDetail.payment_method)}</strong>
                                        </div>
                                        <div>
                                            <span>Total</span>
                                            <strong>{formatCurrency(Math.max(orderDetail.total_price - orderDetail.discount, 0))}</strong>
                                        </div>
                                        <div>
                                            <span>Address</span>
                                            <strong>{orderDetail.shipping_address || "Not recorded"}</strong>
                                        </div>
                                    </div>

                                    <div className="order-history__timeline">
                                        {(orderDetail.timeline && orderDetail.timeline.length > 0
                                            ? orderDetail.timeline
                                            : [{ id: 0, label: "Placed", note: "Order was placed.", created_at: orderDetail.date_added, status: orderDetail.status }]
                                        ).map((event) => (
                                            <span key={`${event.id}-${event.label}`} className="is-done">
                                                <strong>{event.label}</strong>
                                                <small>{event.created_at ? formatUtcDateTime(event.created_at) : ""}</small>
                                                {event.note ? <em>{event.note}</em> : null}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="order-history__items">
                                        {orderDetail.items.map((item) => (
                                            <div key={`${orderDetail.id}-${item.productId}`}>
                                                <div>
                                                    <strong>{item.productName}</strong>
                                                    <span>
                                                        {item.brand} | {item.category}
                                                    </span>
                                                </div>
                                                <span>
                                                    {item.quantity} x {formatCurrency(item.sale_price ?? item.price)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : null}
                        </aside>
                    </section>
                )}
            </main>
        </Layout>
    );
};

export default OrderHistoryPage;
