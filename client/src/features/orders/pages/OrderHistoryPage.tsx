import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { CartIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import LoadingScreen from "../../../components/common/LoadingScreen";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useT } from "../../../hooks/useT";
import "../../../styles/features/orders/_order-history.scss";
import { formatUtcDate, formatUtcDateTime } from "../../../utils/dateTime";
import CustomerAccountShell from "../../users/components/CustomerAccountShell";
import { addItemsToCustomerCart, cancelCustomerOrder, fetchCustomerOrderDetail, fetchCustomerOrders } from "../api";
import type { CustomerOrder, CustomerOrderDetail, CustomerOrderTimelineEvent } from "../types";
import { formatShippingAddress } from "../shippingAddress";
import { formatCurrency } from "../../../utils/currency";
import { getOrderStatusKey, ORDER_STATUS } from "../orderStatus";
import { HISTORICAL_PAYMENT_METHOD, PAYMENT_METHOD } from "../constants";
import { CURRENCY_CODE, CURRENCY_FORMATTING } from "../../../constants/currency";

const getStatusLabel = (status: number, t: ReturnType<typeof useT>) => {
    const labels = { pending: t("orders.statusPending"), done: t("orders.statusDone"), canceled: t("orders.statusCanceled"), unknown: t("orders.statusUnknown") };
    return labels[getOrderStatusKey(status)];
};

const getPaymentLabel = (payment: CustomerOrder["payment_method"] | undefined, t: ReturnType<typeof useT>) => {
    if (payment === HISTORICAL_PAYMENT_METHOD.BANK_TRANSFER) return t("orders.paymentBankTransfer");
    if (payment === PAYMENT_METHOD.CASH) return t("orders.paymentCash");
    if (payment === PAYMENT_METHOD.PAYOS) return t("orders.paymentPayos");
    if (payment === HISTORICAL_PAYMENT_METHOD.STRIPE || payment === HISTORICAL_PAYMENT_METHOD.CARD) return t("orders.paymentCard");
    return t("orders.paymentNotRecorded");
};
const formatPaymentAmount = (value: number | null | undefined, currency?: string | null) => {
    if (value === null || value === undefined || !currency) return null;
    const formatting = currency === CURRENCY_CODE.VND
        ? CURRENCY_FORMATTING[CURRENCY_CODE.VND]
        : CURRENCY_FORMATTING[CURRENCY_CODE.USD];
    return new Intl.NumberFormat(formatting.locale, {
        style: "currency",
        currency,
        maximumFractionDigits: formatting.fractionDigits,
    }).format(Number(value) || 0);
};
const ORDER_PAGE_SIZE = 8;

const OrderHistoryPage = () => {
    const { userData } = useAuth();
    const [searchParams] = useSearchParams();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(true);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [orderDetail, setOrderDetail] = useState<CustomerOrderDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isCanceling, setIsCanceling] = useState(false);

    useEffect(() => {
        const fetchOrders = async () => {
            if (!uid) {
                setIsLoadingOrders(false);
                return;
            }

            try {
                setIsLoadingOrders(true);
                setOrders(await fetchCustomerOrders(uid));
            } catch {
                addToast(t("orders.listTitle"), t("orders.loadError"));
            } finally {
                setIsLoadingOrders(false);
            }
        };

        fetchOrders();
    }, [addToast, t, uid]);

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
                addToast(t("orders.listTitle"), t("orders.detailError"));
            } finally {
                setLoadingDetail(false);
            }
        };

        fetchDetail();
    }, [addToast, selectedOrderId, t]);

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
            addToast(t("orders.reorderToastTitle"), t("orders.reorderNone"));
            return;
        }

        try {
            await addItemsToCustomerCart(uid, availableItems);
            addToast(t("orders.reorderToastTitle"), t("orders.reorderSuccess"));
        } catch {
            addToast(t("orders.reorderToastTitle"), t("orders.reorderError"));
        }
    };

    const handleCancel = async () => {
        if (!orderDetail || orderDetail.status !== ORDER_STATUS.PENDING || isCanceling) return;

        try {
            setIsCanceling(true);
            const canceledOrder = await cancelCustomerOrder(orderDetail.id);
            if (canceledOrder) {
                setOrders((current) => current.map((order) => order.id === canceledOrder.id ? { ...order, ...canceledOrder } : order));
                setOrderDetail(await fetchCustomerOrderDetail(orderDetail.id));
            }
            addToast(t("orders.cancelSuccessTitle"), t("orders.cancelSuccess"));
        } catch (error: unknown) {
            const message = error && typeof error === "object" && "response" in error
                ? String((error as { response?: { data?: { msg?: string } } }).response?.data?.msg || t("orders.cancelError"))
                : t("orders.cancelError");
            addToast(t("orders.cancelErrorTitle"), message);
        } finally {
            setIsCanceling(false);
        }
    };

    if (isLoadingOrders) {
        return (
            <Layout>
                <LoadingScreen variant="page" />
            </Layout>
        );
    }

    return (
        <Layout>
            <Helmet>
                <title>{t("orders.metaTitle")}</title>
                <meta name="description" content={t("orders.metaDescription")} />
            </Helmet>
            <main className="order-history">
                <CustomerAccountShell
                    eyebrow={t("orders.eyebrow")}
                    title={t("orders.title")}
                    description={t("orders.description")}
                />

                <section className="order-history__summary" aria-label={t("orders.summaryAria")}>
                    <article>
                        <span>{t("orders.totalOrders")}</span>
                        <strong>{orders.length}</strong>
                    </article>
                    <article>
                        <span>{t("orders.currentPage")}</span>
                        <strong>{currentPage}</strong>
                    </article>
                    <article>
                        <span>{t("orders.selectedOrder")}</span>
                        <strong>{selectedOrder ? t("orders.orderLabel", selectedOrder.id) : t("orders.none")}</strong>
                    </article>
                </section>

                {orders.length === 0 ? (
                    <section className="order-history__empty">
                        <EmptyState
                            title={t("orders.noOrders")}
                            description={t("orders.noOrdersDescription")}
                            actionLabel={t("orders.startShopping")}
                            actionTo="/shops"
                            compact
                        />
                    </section>
                ) : (
                    <section className="order-history__layout">
                        <div className="order-history__list">
                            <div className="order-history__list-header">
                                <div>
                                    <h2>{t("orders.listTitle")}</h2>
                                    <p>
                                        {t("orders.totalOrdersCount", orders.length)}
                                    </p>
                                </div>
                                <span>
                                    {t("orders.pageOf", currentPage, totalPages)}
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
                                        <strong>{t("orders.orderLabel", order.id)}</strong>
                                        <span>{formatUtcDate(order.date_added)}</span>
                                        <div className="order-history__order-button-meta">
                                            <em>{getStatusLabel(order.status, t)}</em>
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
                                        {t("orders.previous")}
                                    </button>
                                    <span>
                                        {t("orders.pageOf", currentPage, totalPages)}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                                        disabled={currentPage === totalPages}
                                    >
                                        {t("orders.next")}
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
                                                {getStatusLabel(orderDetail.status, t)}
                                            </span>
                                            <h2>{t("orders.orderLabel", orderDetail.id)}</h2>
                                            <p>{formatUtcDateTime(orderDetail.date_added)}</p>
                                        </div>
                                        <div className="order-history__detail-actions">
                                            <button type="button" onClick={handleReorder}>
                                                <CartIcon size={18} />
                                                {t("orders.reorder")}
                                            </button>
                                            {orderDetail.status === ORDER_STATUS.PENDING ? (
                                                <button type="button" className="order-history__cancel" onClick={handleCancel} disabled={isCanceling}>
                                                    {isCanceling ? t("orders.canceling") : t("orders.cancelOrder")}
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>

                                    <div className="order-history__meta">
                                        <div className="order-history__meta-card">
                                            <span>{t("orders.payment")}</span>
                                            <strong>{getPaymentLabel(orderDetail.payment_method, t)}</strong>
                                        </div>
                                        <div className="order-history__meta-card">
                                            <span>{t("orders.total")}</span>
                                            <strong>
                                                {formatCurrency(
                                                    Math.max(orderDetail.total_price - orderDetail.discount, 0),
                                                )}
                                            </strong>
                                            {formatPaymentAmount(orderDetail.payment_amount, orderDetail.payment_currency) ? (
                                                <small>{t("orders.settlementAmount", formatPaymentAmount(orderDetail.payment_amount, orderDetail.payment_currency) || "")}</small>
                                            ) : null}
                                        </div>
                                        <div className="order-history__meta-card">
                                            <span>{t("orders.address")}</span>
                                            <strong>{formatShippingAddress(orderDetail.shipping_address) || t("orders.notRecorded")}</strong>
                                        </div>
                                    </div>

                                    <div className="order-history__timeline">
                                        {(orderDetail.timeline && orderDetail.timeline.length > 0
                                            ? orderDetail.timeline
                                            : [
                                                  {
                                                      id: 0,
                                                      label: t("orders.placed"),
                                                      note: t("orders.placedNote"),
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
