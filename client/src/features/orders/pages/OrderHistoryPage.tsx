import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useSearchParams } from "react-router-dom";
import { CartIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import "../../../styles/features/orders/_order-history.scss";
import { formatUtcDate, formatUtcDateTime } from "../../../utils/dateTime";
import CustomerAccountShell from "../../users/components/CustomerAccountShell";
import { addItemsToCustomerCart, fetchCustomerOrderDetail, fetchCustomerOrders } from "../api";
import type { CustomerOrder, CustomerOrderDetail, CustomerOrderTimelineEvent } from "../types";

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
const ORDER_PAGE_SIZE = 8;

const OrderHistoryPage = () => {
    const { userData } = useAuth();
    const [searchParams] = useSearchParams();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [orderDetail, setOrderDetail] = useState<CustomerOrderDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

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

    const totalPages = Math.max(1, Math.ceil(orders.length / ORDER_PAGE_SIZE));

    const visibleOrders = useMemo(() => {
        const startIndex = (currentPage - 1) * ORDER_PAGE_SIZE;
        return orders.slice(startIndex, startIndex + ORDER_PAGE_SIZE);
    }, [currentPage, orders]);

    useEffect(() => {
        if (!selectedOrderId && orders.length > 0) {
            const requestedOrderId = Number(searchParams.get("order"));
            const requestedOrder = orders.find((order) => order.id === requestedOrderId);
            const initialOrder = requestedOrder || orders[0];
            setSelectedOrderId(initialOrder.id);
            const initialOrderIndex = orders.findIndex((order) => order.id === initialOrder.id);
            setCurrentPage(Math.floor(initialOrderIndex / ORDER_PAGE_SIZE) + 1);
        }
    }, [orders, searchParams, selectedOrderId]);

    useEffect(() => {
        if (visibleOrders.length === 0 || selectedOrderId === null) return;

        const selectedOrderIsVisible = visibleOrders.some((order) => order.id === selectedOrderId);
        if (!selectedOrderIsVisible) {
            setSelectedOrderId(visibleOrders[0].id);
        }
    }, [selectedOrderId, visibleOrders]);

    useEffect(() => {
        if (orders.length === 0) {
            if (currentPage !== 1) {
                setCurrentPage(1);
            }
            return;
        }

        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, orders.length, totalPages]);

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

                <section className="order-history__summary" aria-label="Order history summary">
                    <article>
                        <span>Total orders</span>
                        <strong>{orders.length}</strong>
                    </article>
                    <article>
                        <span>Current page</span>
                        <strong>{currentPage}</strong>
                    </article>
                    <article>
                        <span>Selected order</span>
                        <strong>{selectedOrder ? `#${selectedOrder.id}` : "None"}</strong>
                    </article>
                </section>

                {orders.length === 0 ? (
                    <section className="order-history__empty">
                        <EmptyState
                            title="No orders yet"
                            description="Your completed checkout history will appear here once you place your first order."
                            actionLabel="Start shopping"
                            actionTo="/shops"
                            compact
                        />
                    </section>
                ) : (
                    <section className="order-history__layout">
                        <div className="order-history__list">
                            <div className="order-history__list-header">
                                <div>
                                    <h2>Orders</h2>
                                    <p>
                                        {orders.length} total order{orders.length === 1 ? "" : "s"}
                                    </p>
                                </div>
                                <span>
                                    Page {currentPage} / {totalPages}
                                </span>
                            </div>
                            <div className="order-history__list-body">
                                {visibleOrders.map((order) => (
                                    <button
                                        key={order.id}
                                        type="button"
                                        className={`order-history__order-button${
                                            selectedOrder?.id === order.id ? " order-history__order-button--active" : ""
                                        }`}
                                        onClick={() => setSelectedOrderId(order.id)}
                                    >
                                        <strong>Order #{order.id}</strong>
                                        <span>{formatUtcDate(order.date_added)}</span>
                                        <div className="order-history__order-button-meta">
                                            <em>{getStatusLabel(order.status)}</em>
                                            <small>{formatCurrency(Math.max(order.total_price - order.discount, 0))}</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                            {totalPages > 1 ? (
                                <div className="order-history__pagination">
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                                        disabled={currentPage === 1}
                                    >
                                        Previous
                                    </button>
                                    <span>
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        Next
                                    </button>
                                </div>
                            ) : null}
                        </div>

                        <aside className="order-history__detail">
                            {loadingDetail ? (
                                <div className="order-history__detail-loading" aria-hidden="true">
                                    <span className="order-history__skeleton order-history__skeleton--status" />
                                    <span className="order-history__skeleton order-history__skeleton--title" />
                                    <span className="order-history__skeleton order-history__skeleton--line" />
                                    <div className="order-history__detail-loading-grid">
                                        {Array.from({ length: 3 }, (_, index) => (
                                            <span key={`order-meta-loading-${index}`} className="order-history__skeleton order-history__skeleton--card" />
                                        ))}
                                    </div>
                                    <span className="order-history__skeleton order-history__skeleton--line" />
                                    <span className="order-history__skeleton order-history__skeleton--line order-history__skeleton--line-short" />
                                </div>
                            ) : orderDetail ? (
                                <>
                                    <div className="order-history__detail-header">
                                        <div>
                                            <span
                                                className={`order-history__status order-history__status--${orderDetail.status}`}
                                            >
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
                                        <div className="order-history__meta-card">
                                            <span>Payment</span>
                                            <strong>{getPaymentLabel(orderDetail.payment_method)}</strong>
                                        </div>
                                        <div className="order-history__meta-card">
                                            <span>Total</span>
                                            <strong>
                                                {formatCurrency(
                                                    Math.max(orderDetail.total_price - orderDetail.discount, 0),
                                                )}
                                            </strong>
                                        </div>
                                        <div className="order-history__meta-card">
                                            <span>Address</span>
                                            <strong>{orderDetail.shipping_address || "Not recorded"}</strong>
                                        </div>
                                    </div>

                                    <div className="order-history__timeline">
                                        {(orderDetail.timeline && orderDetail.timeline.length > 0
                                            ? orderDetail.timeline
                                            : [
                                                  {
                                                      id: 0,
                                                      label: "Placed",
                                                      note: "Order was placed.",
                                                      created_at: orderDetail.date_added,
                                                      status: orderDetail.status,
                                                  },
                                              ]
                                        ).map((event: CustomerOrderTimelineEvent) => (
                                            <span
                                                key={`${event.id}-${event.label}`}
                                                className="order-history__timeline-event order-history__timeline-event--done"
                                            >
                                                <strong>{event.label}</strong>
                                                <small>
                                                    {event.created_at ? formatUtcDateTime(event.created_at) : ""}
                                                </small>
                                                {event.note ? <em>{event.note}</em> : null}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="order-history__items">
                                        {orderDetail.items.map((item: CustomerOrderDetail["items"][number]) => (
                                            <div
                                                key={`${orderDetail.id}-${item.productId}`}
                                                className="order-history__item"
                                            >
                                                <div className="order-history__item-info">
                                                    <strong>{item.productName}</strong>
                                                    <span>
                                                        {item.brand} | {item.category}
                                                    </span>
                                                </div>
                                                <span className="order-history__item-price">
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
