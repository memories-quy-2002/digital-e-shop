import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminWorkflowSteps from "../../../components/common/admin/AdminWorkflowSteps";
import { useToast } from "../../../context/ToastContext";
import { CheckCircleIcon, XCircleIcon } from "../../../components/common/Icons";
import { Helmet } from "react-helmet";
import { formatUtcDate, formatUtcDateTime, toUtcIsoString } from "../../../utils/dateTime";

interface Order {
    id: number;
    date_added: Date;
    user_id: string;
    customer_name?: string;
    customer_email?: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash";
}

type OrderDetail = Order & {
    items: Array<{
        productId: number;
        productName: string;
        brand: string;
        category: string;
        price: number;
        sale_price: number | null;
        quantity: number;
        totalPrice: number;
    }>;
    timeline?: Array<{
        id: number;
        label: string;
        note: string | null;
        created_at: string | null;
        status: number;
    }>;
};

const ITEMS_PER_PAGE = 8;

const orderWorkflowSteps = ["Review pending orders", "Open detail before changing status", "Mark done or cancel"];

const normalizeOrder = (order: any): Order => ({
    ...order,
    id: Number(order.id),
    total_price: Number(order.total_price) || 0,
    discount: Number(order.discount) || 0,
    date_added: new Date(order.date_added),
});

const getPaymentMethodLabel = (paymentMethod?: Order["payment_method"]) => {
    if (paymentMethod === "bank_transfer") return "Bank transfer";
    if (paymentMethod === "cash") return "Cash on delivery";
    return "Not recorded";
};

const getStatusLabel = (status: number) => {
    if (status === 1) return "Done";
    if (status === 0) return "Pending";
    return "Canceled";
};

const getNetRevenue = (order: Order) => Math.max(order.total_price - order.discount, 0);

const getShortId = (value: string) => (value.length > 14 ? `${value.slice(0, 10)}...` : value);

const getCustomerName = (order: Order) => order.customer_name || getShortId(order.user_id);

const getCustomerMeta = (order: Order) => order.customer_email || order.user_id;

const getItemSubtotal = (price: number, quantity: number) => price * quantity;

const AdminOrderPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get("/api/orders");
                if (response.status === 200) {
                    setOrders((response.data.orders || []).map(normalizeOrder));
                }
            } catch {
                addToast("Orders", "Unable to load orders.");
            }
        };

        fetchOrders();
    }, [addToast]);

    const filteredOrders = useMemo(() => {
        const lowerSearchTerm = searchTerm.trim().toLowerCase();

        if (!lowerSearchTerm) {
            return orders;
        }

        return orders.filter((order) => {
            return (
                order.id.toString().includes(lowerSearchTerm) ||
                (order.shipping_address || "").toLowerCase().includes(lowerSearchTerm) ||
                order.user_id.toLowerCase().includes(lowerSearchTerm) ||
                (order.customer_name || "").toLowerCase().includes(lowerSearchTerm) ||
                (order.customer_email || "").toLowerCase().includes(lowerSearchTerm) ||
                getPaymentMethodLabel(order.payment_method).toLowerCase().includes(lowerSearchTerm) ||
                getStatusLabel(order.status).toLowerCase().includes(lowerSearchTerm)
            );
        });
    }, [orders, searchTerm]);

    const pageCount = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
    const currentOrders = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredOrders.slice(start, start + ITEMS_PER_PAGE);
    }, [currentPage, filteredOrders]);

    const orderStats = useMemo(() => {
        const pending = orders.filter((order) => order.status === 0).length;
        const completed = orders.filter((order) => order.status === 1).length;
        const canceled = orders.filter((order) => order.status === 2).length;
        const bankTransfer = orders.filter((order) => order.payment_method === "bank_transfer").length;
        const revenue = orders.reduce((sum, order) => sum + getNetRevenue(order), 0);

        return {
            total: orders.length,
            pending,
            completed,
            canceled,
            bankTransfer,
            revenue,
        };
    }, [orders]);

    useEffect(() => {
        const safePageCount = Math.max(pageCount, 1);
        if (currentPage > safePageCount) {
            setCurrentPage(1);
        }
    }, [currentPage, pageCount]);

    const handlePageClick = (event: { selected: number }) => {
        setCurrentPage(event.selected + 1);
    };

    const handleChangeStatus = async (status: number, orderId: number) => {
        try {
            const response = await axios.post(`/api/orders/status/${orderId}`, {
                status,
            });
            if (response.status === 200) {
                const updatedOrder = normalizeOrder(response.data.order);
                setOrders((previousOrders) =>
                    previousOrders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
                );
                addToast("Update Order Status", "Order status updated successfully");
            }
        } catch (err) {
            if (err && typeof err === "object" && "response" in err) {
                const errorResponse = (err as { response: { status: number; data: { msg: string } } }).response;
                if (errorResponse.status === 400) {
                    addToast("Update Order Status", "Status is required");
                } else if (errorResponse.status === 404) {
                    addToast("Update Order Status", "Order not found");
                } else if (errorResponse.status === 500) {
                    addToast("Update Order Status", "Internal server error, please try again later");
                }
            }
        }
    };

    const handleOpenDetail = async (orderId: number) => {
        try {
            const response = await axios.get(`/api/orders/${orderId}`);
            if (response.status === 200) {
                setSelectedOrder(response.data.order);
                setShowDetail(true);
            }
        } catch {
            addToast("Orders", "Unable to load order detail.");
        }
    };

    const exportOrdersCsv = () => {
        const rows = [
            [
                "id",
                "customer_name",
                "customer_email",
                "user_id",
                "date_added",
                "payment_method",
                "status",
                "gross_total",
                "discount",
                "net_total",
                "shipping_address",
            ],
            ...orders.map((order) => [
                String(order.id),
                getCustomerName(order),
                order.customer_email || "",
                order.user_id,
                toUtcIsoString(order.date_added),
                getPaymentMethodLabel(order.payment_method),
                getStatusLabel(order.status),
                order.total_price.toFixed(2),
                order.discount.toFixed(2),
                getNetRevenue(order).toFixed(2),
                order.shipping_address || "",
            ]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "digital-e-orders.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Orders | Digital-E</title>
                <meta name="description" content="Manage and view orders placed in the store." />
            </Helmet>
            <main className="admin__page admin__page--orders">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Operations</span>
                        <h2 className="admin__page__title">Orders</h2>
                        <p className="admin__page__subtitle">
                            Monitor the full order pipeline, keep tabs on payment mix, and resolve pending deliveries.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--primary" onClick={exportOrdersCsv}>
                            Export orders CSV
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total orders</span>
                        <strong>{orderStats.total}</strong>
                        <p>Across every recorded purchase</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Pending</span>
                        <strong>{orderStats.pending}</strong>
                        <p>Still waiting for action</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Bank transfer</span>
                        <strong>{orderStats.bankTransfer}</strong>
                        <p>Need payment confirmation</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Completed</span>
                        <strong>{orderStats.completed}</strong>
                        <p>Successfully fulfilled</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Canceled</span>
                        <strong>{orderStats.canceled}</strong>
                        <p>Closed without fulfillment</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Net revenue</span>
                        <strong>${orderStats.revenue.toFixed(2)}</strong>
                        <p>Total after discounts</p>
                    </div>
                </section>

                <AdminWorkflowSteps steps={orderWorkflowSteps} />

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Order list</h3>
                            <span>{filteredOrders.length} matching orders</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <input
                                    type="text"
                                    name="order-search"
                                    id="order-search"
                                    placeholder="Search by order ID, customer, email, address, payment, or status"
                                    value={searchTerm}
                                    onChange={(event) => {
                                        setSearchTerm(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setCurrentPage(1);
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        <div className="admin__table-wrap">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Order</th>
                                    <th>Customer</th>
                                    <th>Payment</th>
                                    <th>Total</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentOrders.map((order, index) => (
                                    <tr key={order.id} className="admin__order-row">
                                        <td width="50px">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                        <td width="190px">
                                            <div className="admin__table__stack">
                                                <strong>#{order.id}</strong>
                                                <span>{formatUtcDate(order.date_added)}</span>
                                            </div>
                                        </td>
                                        <td width="260px">
                                            <div className="admin__table__stack">
                                                <strong title={order.user_id}>{getCustomerName(order)}</strong>
                                                <span>{getCustomerMeta(order)}</span>
                                                <small>{order.shipping_address || "No address"}</small>
                                            </div>
                                        </td>
                                        <td width="180px">
                                            <span
                                                className={
                                                    order.payment_method === "bank_transfer"
                                                        ? "admin__pill admin__pill--info"
                                                        : order.payment_method === "cash"
                                                          ? "admin__pill admin__pill--success"
                                                          : "admin__pill admin__pill--muted"
                                                }
                                            >
                                                {getPaymentMethodLabel(order.payment_method)}
                                            </span>
                                        </td>
                                        <td width="160px">
                                            <div className="admin__table__stack">
                                                <strong>${getNetRevenue(order).toFixed(2)}</strong>
                                                <span>Discount ${order.discount.toFixed(2)}</span>
                                            </div>
                                        </td>
                                        <td width="150px">
                                            <span
                                                className={
                                                    order.status === 1
                                                        ? "admin__pill admin__pill--success"
                                                        : order.status === 0
                                                          ? "admin__pill admin__pill--warning"
                                                          : "admin__pill admin__pill--danger"
                                                }
                                            >
                                                {getStatusLabel(order.status)}
                                            </span>
                                        </td>
                                        <td width="100px">
                                            {order.status === 0 ? (
                                                <div className="admin__table__actions">
                                                    <button
                                                        type="button"
                                                        className="admin__button admin__button--ghost admin__icon-button"
                                                        onClick={() => handleOpenDetail(order.id)}
                                                    >
                                                        View
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="admin__button admin__button--danger admin__button--compact"
                                                        data-testid="cancelBtn"
                                                        aria-label={`Cancel order ${order.id}`}
                                                        onClick={() => handleChangeStatus(2, order.id)}
                                                    >
                                                        <XCircleIcon size={22} />
                                                        <span>Cancel</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="admin__button admin__button--success admin__button--compact"
                                                        data-testid="doneBtn"
                                                        aria-label={`Mark order ${order.id} as done`}
                                                        onClick={() => handleChangeStatus(1, order.id)}
                                                    >
                                                        <CheckCircleIcon size={22} />
                                                        <span>Done</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="admin__button admin__button--ghost admin__icon-button"
                                                    onClick={() => handleOpenDetail(order.id)}
                                                >
                                                    View
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        </div>
                        <div className="admin__table__pagination">
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                pageClassName="pagination__item"
                                pageLinkClassName="pagination__link"
                                previousClassName="pagination__item"
                                nextClassName="pagination__item"
                                breakClassName="pagination__item"
                                activeClassName="selected"
                                disabledClassName="disabled"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                forcePage={Math.max(currentPage - 1, 0)}
                                renderOnZeroPageCount={null}
                            />
                        </div>
                    </div>
                </section>

                <Modal
                    show={showDetail}
                    onHide={() => setShowDetail(false)}
                    size="lg"
                    centered
                    dialogClassName="admin__dialog"
                    contentClassName="admin__dialog__content"
                >
                    <Modal.Header closeButton>
                        <Modal.Title>Order detail</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {selectedOrder ? (
                            <div className="admin__order-detail">
                                <section className="admin__detail-section">
                                    <div className="admin__detail-section__header">
                                        <h4>Order summary</h4>
                                        <p>Core order, customer, payment, and pricing information.</p>
                                    </div>
                                    <div className="admin__order-detail__summary">
                                    <div>
                                        <span>Order</span>
                                        <strong>#{selectedOrder.id}</strong>
                                        <small>{formatUtcDateTime(selectedOrder.date_added)}</small>
                                    </div>
                                    <div>
                                        <span>Customer</span>
                                        <strong>{getCustomerName(selectedOrder)}</strong>
                                        <small>{getCustomerMeta(selectedOrder)}</small>
                                    </div>
                                    <div>
                                        <span>Status</span>
                                        <strong>{getStatusLabel(selectedOrder.status)}</strong>
                                    </div>
                                    <div>
                                        <span>Total</span>
                                        <strong>${getNetRevenue(selectedOrder).toFixed(2)}</strong>
                                        <small>Discount ${selectedOrder.discount.toFixed(2)}</small>
                                    </div>
                                    <div>
                                        <span>Payment</span>
                                        <strong>{getPaymentMethodLabel(selectedOrder.payment_method)}</strong>
                                    </div>
                                    </div>
                                </section>
                                <section className="admin__detail-section">
                                    <div className="admin__detail-section__header">
                                        <h4>Timeline</h4>
                                        <p>Important events recorded for this order.</p>
                                    </div>
                                    <div className="admin__order-detail__timeline">
                                    {(selectedOrder.timeline && selectedOrder.timeline.length > 0
                                        ? selectedOrder.timeline
                                        : [{ id: 0, label: "Placed", note: "Order was placed.", created_at: String(selectedOrder.date_added), status: selectedOrder.status }]
                                    ).map((event) => (
                                        <span key={`${event.id}-${event.label}`} className="is-done">
                                            <strong>{event.label}</strong>
                                            <small>{event.created_at ? formatUtcDateTime(event.created_at) : ""}</small>
                                            {event.note ? <em>{event.note}</em> : null}
                                        </span>
                                    ))}
                                    </div>
                                </section>
                                <section className="admin__detail-section">
                                    <div className="admin__detail-section__header">
                                        <h4>Shipping</h4>
                                        <p>Recorded delivery destination for this order.</p>
                                    </div>
                                    <div className="admin__order-detail__address">
                                    <span>Shipping address</span>
                                    <strong>{selectedOrder.shipping_address || "Not recorded"}</strong>
                                    </div>
                                </section>
                                <section className="admin__detail-section">
                                    <div className="admin__detail-section__header">
                                        <h4>Items ordered</h4>
                                        <p>Line items included in the purchase.</p>
                                    </div>
                                    <div className="admin__order-detail__items">
                                    <div className="admin__order-detail__items__header">
                                        <span>Items ordered</span>
                                        <strong>{selectedOrder.items.length} products</strong>
                                    </div>
                                    {selectedOrder.items.map((item) => (
                                        <div key={`${selectedOrder.id}-${item.productId}`} className="admin__order-detail__item-row">
                                            <div className="admin__order-detail__item-row__info">
                                                <strong>{item.productName}</strong>
                                                <span>
                                                    {item.brand} | {item.category}
                                                </span>
                                                <small>Product #{item.productId}</small>
                                            </div>
                                            <div className="admin__order-detail__item-row__pricing">
                                                <strong>${getItemSubtotal(item.sale_price ?? item.price, item.quantity).toFixed(2)}</strong>
                                                <span>
                                                    {item.quantity} x ${(item.sale_price ?? item.price).toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                </section>
                            </div>
                        ) : null}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowDetail(false)}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>
            </main>
        </AdminLayout>
    );
};

export default AdminOrderPage;

