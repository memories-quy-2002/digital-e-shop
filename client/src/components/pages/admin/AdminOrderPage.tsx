import { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import AdminLayout from "../../layout/AdminLayout";

interface Order {
    id: number;
    date_added: Date;
    user_id: string;
    status: number;
    total_price: number;
}

const AdminOrderPage = () => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const itemsPerPage = 5;
    const endOffset = itemOffset + itemsPerPage;
    const currentOrders = orders.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(orders.length / itemsPerPage);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * itemsPerPage) % orders.length;
        console.log(
            `User requested page number ${event.selected}, which is offset ${newOffset}`
        );
        setItemOffset(newOffset);
    };
    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await axios.get(`/api/orders/`);
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
    console.log(orders);
    return (
        <AdminLayout>
            <div className="admin__order">
                <div className="admin__order__list">
                    <div className="admin__order__list__search">
                        <div>
                            <h4>List of orders</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search order"
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
                                    <tr>
                                        <td width="50px">
                                            {orders.indexOf(order) + 1}
                                        </td>
                                        <td>00000{order.id}</td>
                                        <td width="500px">
                                            123, ABC Street, HCM City, Vietnam
                                        </td>
                                        <td width="150px">
                                            {new Date(
                                                order.date_added
                                            ).toLocaleDateString("en-GB")}
                                        </td>
                                        <td width="150px">
                                            ${order.total_price.toFixed(2)}
                                        </td>
                                        <td width="150px">
                                            {order.status === 1
                                                ? "Done"
                                                : order.status === 0
                                                ? "Pending"
                                                : "Canceled"}
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
