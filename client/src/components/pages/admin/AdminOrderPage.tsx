import React, { useEffect, useMemo, useState } from "react";
import { Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import AdminLayout from "../../layout/AdminLayout";
import { useToast } from "../../../context/ToastContext";
import { CheckCircleIcon, XCircleIcon } from "../../common/Icons";
import { Helmet } from "react-helmet";

interface Order {
    id: number;
    date_added: Date;
    user_id: string;
    status: number;
    total_price: number;
    discount: number;
    shipping_address: string;
    payment_method?: "bank_transfer" | "cash";
}

const ITEMS_PER_PAGE = 8;

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

const AdminOrderPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const { addToast } = useToast();

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get("/api/orders");
                if (response.status === 200) {
                    setOrders((response.data.orders || []).map(normalizeOrder));
                }
            } catch (err) {
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

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Order list</h3>
                            <span>{filteredOrders.length} matching orders</span>
                        </div>
                        <div className="admin__filters">
                            <input
                                type="text"
                                name="order-search"
                                id="order-search"
                                placeholder="Search by order ID, address, user, payment, or status"
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
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Order ID</th>
                                    <th>User</th>
                                    <th>Payment</th>
                                    <th>Address</th>
                                    <th>Date</th>
                                    <th>Gross</th>
                                    <th>Discount</th>
                                    <th>Net</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentOrders.map((order, index) => (
                                    <tr key={order.id}>
                                        <td width="50px">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                        <td width="110px">#{order.id}</td>
                                        <td width="220px">{order.user_id}</td>
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
                                        <td width="360px">{order.shipping_address || "None"}</td>
                                        <td width="150px">{new Date(order.date_added).toLocaleDateString("en-GB")}</td>
                                        <td width="125px">${order.total_price.toFixed(2)}</td>
                                        <td width="125px">${order.discount.toFixed(2)}</td>
                                        <td width="125px">${getNetRevenue(order).toFixed(2)}</td>
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
                                                        data-testid="cancelBtn"
                                                        onClick={() => handleChangeStatus(2, order.id)}
                                                    >
                                                        <XCircleIcon size={22} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid="doneBtn"
                                                        onClick={() => handleChangeStatus(1, order.id)}
                                                    >
                                                        <CheckCircleIcon size={22} />
                                                    </button>
                                                </div>
                                            ) : null}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
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
            </main>
        </AdminLayout>
    );
};

export default AdminOrderPage;
