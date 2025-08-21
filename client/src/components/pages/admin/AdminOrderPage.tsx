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
    useEffect(() => {
        console.log("Filtered:", filteredOrders);
    }, [filteredOrders]);
    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Order Management</title>
                <meta name="description" content="Manage and view orders placed in the store." />
            </Helmet>
            <div className="admin__order">
                <section className="admin__dashboard-summary" style={{ marginBottom: 24 }}>
                    <h4>Order Summary</h4>
                    <ul>
                        <li>
                            <strong>Total Orders:</strong> {orders.length}
                        </li>
                        <li>
                            <strong>Visible (filtered):</strong> {filteredOrders.length}
                        </li>
                        <li>
                            <strong>Pending:</strong> {orders.filter((o) => o.status === 0).length}
                        </li>
                        <li>
                            <strong>Done:</strong> {orders.filter((o) => o.status === 1).length}
                        </li>
                        <li>
                            <strong>Canceled:</strong> {orders.filter((o) => o.status === 2).length}
                        </li>
                        <li>
                            <strong>Search:</strong> {searchTerm || "All"}
                        </li>
                    </ul>
                </section>
                <div className="admin__order__list">
                    <div className="admin__order__list__search">
                        <div>
                            <h4>List of orders</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search order"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>
                    <div className="admin__order__list__table">
                        <Table responsive striped borderless hover>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Order ID</th>
                                    <th>Address</th>
                                    <th>Date</th>
                                    <th>Price</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentOrders.map((order) => (
                                    <tr key="id">
                                        <td width="50px">{filteredOrders.indexOf(order) + 1}</td>
                                        <td width="150px">{order.id}</td>
                                        <td width="450px">{order.shipping_address || "None"}</td>
                                        <td width="150px">{new Date(order.date_added).toLocaleDateString("en-GB")}</td>
                                        <td width="125px">${order.total_price.toFixed(2)}</td>
                                        <td width="150px">
                                            {order.status === 1 ? "Done" : order.status === 0 ? "Pending" : "Canceled"}
                                        </td>
                                        <td width="75px">
                                            {order.status === 0 && (
                                                <div>
                                                    <button
                                                        type="button"
                                                        data-testid="cancelBtn"
                                                        onClick={() => handleChangeStatus(2, order.id)}
                                                    >
                                                        <MdCancel size={24} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        data-testid="doneBtn"
                                                        onClick={() => handleChangeStatus(1, order.id)}
                                                    >
                                                        <FaCheck size={24} />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
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
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminOrderPage;
