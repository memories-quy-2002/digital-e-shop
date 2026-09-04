import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Table } from "../../../components/ui/legacy";
import ReactPaginate from "react-paginate";
import type { AdminOrder as Order, AdminOrderDetail as OrderDetail } from "../../../types/order";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminWorkflowSteps from "../../../components/common/admin/AdminWorkflowSteps";
import ConfirmActionModal from "../../../components/common/ConfirmActionModal";
import { useToast } from "../../../context/ToastContext";
import { CheckCircleIcon, XCircleIcon } from "../../../components/common/Icons";
import { Helmet } from "react-helmet";
import { formatUtcDate, formatUtcDateTime, toUtcIsoString } from "../../../utils/dateTime";
import { fetchAllOrders, fetchOrderDetail, updateOrderStatus, bulkUpdateOrderStatus } from "../api";

const ITEMS_PER_PAGE = 8;

type StatusFilter = "all" | "pending" | "done" | "canceled";
type PaymentFilter = "all" | "bank_transfer" | "cash" | "none";

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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
    const [showDetail, setShowDetail] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [showBulkConfirm, setShowBulkConfirm] = useState(false);
    const [bulkTarget, setBulkTarget] = useState<1 | 2 | null>(null);
    const [isBulkSubmitting, setIsBulkSubmitting] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        const loadOrders = async () => {
            try {
                const orders = await fetchAllOrders();
                setOrders((orders || []).map(normalizeOrder));
            } catch {
                addToast("Orders", "Unable to load orders.");
            }
        };

        loadOrders();
    }, [addToast]);

    const filteredOrders = useMemo(() => {
        const lowerSearchTerm = searchTerm.trim().toLowerCase();

        return orders.filter((order) => {
            if (statusFilter !== "all") {
                const expected = statusFilter === "pending" ? 0 : statusFilter === "done" ? 1 : 2;
                if (order.status !== expected) {
                    return false;
                }
            }
            if (paymentFilter !== "all") {
                if (paymentFilter === "none" && order.payment_method) {
                    return false;
                }
                if (paymentFilter !== "none" && order.payment_method !== paymentFilter) {
                    return false;
                }
            }
            if (!lowerSearchTerm) {
                return true;
            }
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
    }, [orders, searchTerm, statusFilter, paymentFilter]);

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

    useEffect(() => {
        setCurrentPage(1);
        setSelectedIds(new Set());
    }, [statusFilter, paymentFilter, searchTerm]);

    const handlePageClick = (event: { selected: number }) => {
        setCurrentPage(event.selected + 1);
    };

    const handleChangeStatus = async (status: number, orderId: number) => {
        try {
            const updated = await updateOrderStatus(orderId, status);
            const updatedOrder = normalizeOrder(updated);
            setOrders((previousOrders) =>
                previousOrders.map((order) => (order.id === updatedOrder.id ? updatedOrder : order)),
            );
            addToast("Update Order Status", "Order status updated successfully");
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
            const order = await fetchOrderDetail(orderId);
            if (order) {
                setSelectedOrder(order);
                setShowDetail(true);
            }
        } catch {
            addToast("Orders", "Unable to load order detail.");
        }
    };

    const toggleSelection = (orderId: number) => {
        setSelectedIds((previous) => {
            const next = new Set(previous);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    };

    const toggleSelectAllOnPage = () => {
        setSelectedIds((previous) => {
            const pageIds = currentOrders.map((order) => order.id);
            const allSelected = pageIds.every((id) => previous.has(id));
            const next = new Set(previous);
            if (allSelected) {
                pageIds.forEach((id) => next.delete(id));
            } else {
                pageIds.forEach((id) => next.add(id));
            }
            return next;
        });
    };

    const selectedPendingIds = useMemo(
        () => currentOrders.filter((o) => o.status === 0).map((o) => o.id),
        [currentOrders],
    );

    const pageAllPendingSelected =
        selectedPendingIds.length > 0 && selectedPendingIds.every((id) => selectedIds.has(id));

    const requestBulk = (status: 1 | 2) => {
        const ids = currentOrders
            .filter((order) => selectedIds.has(order.id) && order.status === 0)
            .map((order) => order.id);
        if (ids.length === 0) {
            addToast("Bulk update", "Select at least one pending order to update.");
            return;
        }
        setBulkTarget(status);
        setShowBulkConfirm(true);
    };

    const confirmBulk = async () => {
        if (!bulkTarget) {
            return;
        }
        const ids = currentOrders
            .filter((order) => selectedIds.has(order.id) && order.status === 0)
            .map((order) => order.id);
        if (ids.length === 0) {
            setShowBulkConfirm(false);
            return;
        }
        setIsBulkSubmitting(true);
        try {
            const results = await bulkUpdateOrderStatus(ids, bulkTarget);
            const fulfilled = results.filter((r) => r.status === "fulfilled");
            const rejected = results.filter((r) => r.status === "rejected");
            if (fulfilled.length > 0) {
                setOrders((previous) =>
                    previous.map((order) => {
                        const result = fulfilled.find((r) => r.orderId === order.id);
                        return result?.order ? normalizeOrder(result.order) : order;
                    }),
                );
            }
            addToast(
                "Bulk update",
                `${fulfilled.length} updated${rejected.length > 0 ? `, ${rejected.length} failed` : ""}.`,
            );
            setSelectedIds(new Set());
        } catch {
            addToast("Bulk update", "Bulk update failed. Try again.");
        } finally {
            setIsBulkSubmitting(false);
            setShowBulkConfirm(false);
            setBulkTarget(null);
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
                            <div className="admin__order-toolbar">
                                <input
                                    type="text"
                                    name="order-search"
                                    id="order-search"
                                    placeholder="Search by order ID, customer, email, address, payment, or status"
                                    value={searchTerm}
                                    onChange={(event) => {
                                        setSearchTerm(event.target.value);
                                    }}
                                />
                                <select
                                    aria-label="Filter by status"
                                    value={statusFilter}
                                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                                >
                                    <option value="all">All statuses</option>
                                    <option value="pending">Pending</option>
                                    <option value="done">Done</option>
                                    <option value="canceled">Canceled</option>
                                </select>
                                <select
                                    aria-label="Filter by payment method"
                                    value={paymentFilter}
                                    onChange={(event) => setPaymentFilter(event.target.value as PaymentFilter)}
                                >
                                    <option value="all">All payments</option>
                                    <option value="bank_transfer">Bank transfer</option>
                                    <option value="cash">Cash on delivery</option>
                                    <option value="none">No payment</option>
                                </select>
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setStatusFilter("all");
                                        setPaymentFilter("all");
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    {selectedIds.size > 0 ? (
                        <div className="admin__bulk-bar" role="region" aria-label="Bulk actions">
                            <span className="admin__bulk-bar__count">{selectedIds.size}</span>
                            <span>order(s) selected on this page</span>
                            <button
                                type="button"
                                className="admin__button admin__button--success admin__button--compact"
                                onClick={() => requestBulk(1)}
                            >
                                Mark selected done
                            </button>
                            <button
                                type="button"
                                className="admin__button admin__button--danger admin__button--compact"
                                onClick={() => requestBulk(2)}
                            >
                                Cancel selected
                            </button>
                            <button
                                type="button"
                                className="admin__button admin__button--ghost admin__button--compact"
                                onClick={() => setSelectedIds(new Set())}
                            >
                                Clear selection
                            </button>
                        </div>
                    ) : null}
                    <div className="admin__card__body admin__list-shell">
                        <div className="admin__table-wrap">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th style={{ width: "40px" }}>
                                        <input
                                            type="checkbox"
                                            className="admin__order-checkbox"
                                            aria-label="Select all pending orders on this page"
                                            checked={pageAllPendingSelected}
                                            disabled={selectedPendingIds.length === 0}
                                            onChange={toggleSelectAllOnPage}
                                        />
                                    </th>
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
                                {currentOrders.map((order, index) => {
                                    const isSelected = selectedIds.has(order.id);
                                    return (
                                    <tr
                                        key={order.id}
                                        className={`admin__order-row${isSelected ? " is-selected" : ""}`}
                                    >
                                        <td>
                                            <input
                                                type="checkbox"
                                                className="admin__order-checkbox"
                                                aria-label={`Select order ${order.id}`}
                                                checked={isSelected}
                                                disabled={order.status !== 0}
                                                onChange={() => toggleSelection(order.id)}
                                            />
                                        </td>
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
                                    );
                                })}
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
                <ConfirmActionModal
                    show={showBulkConfirm}
                    title={bulkTarget === 1 ? "Mark selected orders done" : "Cancel selected orders"}
                    message={
                        bulkTarget === 1
                            ? "Mark all selected pending orders as done?"
                            : "Cancel all selected pending orders? This cannot be undone from this view."
                    }
                    confirmLabel={bulkTarget === 1 ? "Mark done" : "Cancel orders"}
                    confirmVariant={bulkTarget === 1 ? "success" : "danger"}
                    isConfirming={isBulkSubmitting}
                    onCancel={() => {
                        if (!isBulkSubmitting) {
                            setShowBulkConfirm(false);
                            setBulkTarget(null);
                        }
                    }}
                    onConfirm={confirmBulk}
                />
            </main>
        </AdminLayout>
    );
};

export default AdminOrderPage;

