import React, { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import AdminLayout from "../../layout/AdminLayout";
import { FaCheck } from "react-icons/fa6";
import { useToast } from "../../../context/ToastContext";
import { MdCancel } from "react-icons/md";
import { Helmet } from "react-helmet";

interface Order {
    id: number;
    date_added: Date;
    user_id: string;
    status: number;
    total_price: number;
    shipping_address: string;
}

const ITEMS_PER_PAGE = 5;

const AdminOrderPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [filteredOrders, setFilteredOrders] = useState<Order[]>(orders);

    const { addToast } = useToast();
    const endOffset = itemOffset + ITEMS_PER_PAGE;
    const currentOrders = filteredOrders.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * ITEMS_PER_PAGE) % orders.length;
        setItemOffset(newOffset);
    };

    const handleChangeStatus = async (status: number, orderId: number) => {
        try {
            const response = await axios.post(`/api/orders/status/${orderId}`, {
                status,
            });
            if (response.status === 200) {
                const updatedOrders = orders.map((order) =>
                    order.id === response.data.order.id ? response.data.order : order
                );
                setOrders(updatedOrders);
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
                console.error(`${errorResponse.data.msg}`);
            }
        }
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
    };

    const handleClear = () => {
        setSearchTerm("");
    };

    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get(`/api/orders`);
                if (response.status === 200) {
                    setOrders(response.data.orders);
                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchOrders();
        return () => {};
    }, []);

    useEffect(() => {
        const filtered = orders.filter((order) => {
            const lowerSearchTerm = searchTerm.toLowerCase();
            setItemOffset(0);
            return (
                order.id.toString().toLowerCase().includes(lowerSearchTerm) ||
                order.shipping_address.toLowerCase().includes(lowerSearchTerm)
            );
        });
        setFilteredOrders(filtered);
        return () => {};
    }, [searchTerm, orders]);

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Order Management</title>
                <meta name="description" content="Manage and view orders placed in the store." />
            </Helmet>
            <main className="admin__page admin__page--orders">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Operations</span>
                        <h2 className="admin__page__title">Orders</h2>
                        <p className="admin__page__subtitle">Monitor order flow, fulfillment, and delivery progress.</p>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total orders</span>
                        <strong>{orders.length}</strong>
                        <p>All time</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Pending</span>
                        <strong>{orders.filter((o) => o.status === 0).length}</strong>
                        <p>Awaiting action</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Completed</span>
                        <strong>{orders.filter((o) => o.status === 1).length}</strong>
                        <p>Delivered</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Canceled</span>
                        <strong>{orders.filter((o) => o.status === 2).length}</strong>
                        <p>Rejected</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Order list</h3>
                            <span>{filteredOrders.length} results</span>
                        </div>
                        <div className="admin__filters">
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search orders"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                            <button type="button" className="admin__button admin__button--ghost" onClick={handleClear}>
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
                                    <th>Address</th>
                                    <th>Date</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentOrders.map((order) => (
                                    <tr key={order.id}>
                                        <td width="50px">{filteredOrders.indexOf(order) + 1}</td>
                                        <td width="150px">{order.id}</td>
                                        <td width="450px">{order.shipping_address || "None"}</td>
                                        <td width="150px">{new Date(order.date_added).toLocaleDateString("en-GB")}</td>
                                        <td width="125px">${order.total_price.toFixed(2)}</td>
                                        <td width="150px">
                                            {order.status === 1 ? "Done" : order.status === 0 ? "Pending" : "Canceled"}
                                        </td>
                                        <td width="100px">
                                            {order.status === 0 && (
                                                <div className="admin__table__actions">
                                                    <button
                                                        type="button"
                                                        data-testid="cancelBtn"
                                                        onClick={() => handleChangeStatus(2, order.id)}
                                                    >
                                                        <MdCancel size={22} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid="doneBtn"
                                                        onClick={() => handleChangeStatus(1, order.id)}
                                                    >
                                                        <FaCheck size={22} />
                                                    </button>
                                                </div>
                                            )}
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
