import React, { useEffect, useState } from "react";
import { FaBox, FaMoneyBill, FaShoppingCart, FaUser } from "react-icons/fa";
import axios from "../../../api/axios";
import { Product, Role } from "../../../utils/interface";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

import AdminLayout from "../../layout/AdminLayout";
import { Table } from "react-bootstrap";

interface CardProps {
    title: string;
    value: any;
    description: string;
    bgColor: string;
    icon: React.ReactNode;
}

type Order = {
    id: number;
    date_added: Date;
    user_id: string;
    status: number;
    total_price: number;
    discount: number;
    subtotal: number;
};

type OrderItem = {
    id: number;
    name: string;
    sales: number;
    revenue: number;
};

type User = {
    id: string;
    email: string;
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role;
    created_at: Date;
};

type MonthlyRevenue = {
    name: string;
    revenue: number;
};

const Card: React.FC<CardProps> = ({
    title,
    value,
    description,
    bgColor,
    icon,
}) => {
    return (
        <div
            className="admin__dashboard-card"
            style={{ backgroundColor: bgColor }}
        >
            <div className="admin__dashboard-card__title">
                {icon}
                <strong>{title}</strong>
            </div>
            <div className="admin__dashboard-card__details">
                <p>{value}</p>
                <span>{description} </span>
            </div>
        </div>
    );
};

const AdminDashboard = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

    const salesData = [
        { name: "March", sales: 3000 },
        { name: "April", sales: 5000 },
        { name: "May", sales: 20000 },
        { name: "June", sales: 30000 },
        { name: "July", sales: 45000 },
        { name: "August", sales: 10000 },
    ];
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                const response = await axios.get("/api/products");
                if (response.status === 200) {
                    setProducts(response.data.products);

                    console.log(response.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchProducts();
        return () => {};
    }, []);
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
    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`/api/users/`);
                if (response.status === 200) {
                    setUsers(response.data.accounts);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchUsers();
        return () => {};
    }, []);

    useEffect(() => {
        const fetchOrderItems = async () => {
            try {
                const response = await axios.get(`/api/orders/item`);
                if (response.status === 200) {
                    setOrderItems(response.data.orderItems);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchOrderItems();
        return () => {};
    }, []);
    console.log(orderItems);

    const getMonthlyRevenues = (orders: Order[]): MonthlyRevenue[] => {
        const monthlyRevenueMap: { [key: string]: number } = {};
        const currentDate = new Date();

        // Khởi tạo doanh thu cho 6 tháng gần đây nhất
        for (let i = 5; i >= 0; i--) {
            const date = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() - i,
                1
            );
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;
            monthlyRevenueMap[monthKey] = 0;
        }

        // Tính doanh thu theo từng tháng từ dữ liệu orders
        orders.forEach((order) => {
            const date = new Date(order.date_added);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;

            if (monthlyRevenueMap[monthKey] !== undefined) {
                monthlyRevenueMap[monthKey] += order.subtotal;
            }
        });

        // Tạo mảng MonthlyRevenue từ map
        return Object.entries(monthlyRevenueMap).map(([name, revenue]) => ({
            name,
            revenue,
        }));
    };
    const totalSales = orderItems.reduce(
        (accumulate, item) => accumulate + item.sales,
        0
    );
    const totalRevenue = orders.reduce(
        (accumulate, order) => accumulate + order.subtotal,
        0
    );
    return (
        <AdminLayout>
            {" "}
            <div className="admin__dashboard">
                <div className="admin__dashboard-header">
                    <h2>Dashboard</h2>
                    <button className="btn btn-dark">Download Report</button>
                </div>
                <div className="admin__dashboard-cards">
                    <Card
                        title="Sales"
                        value={totalSales}
                        description="Total for this month"
                        bgColor="purple"
                        icon={<FaShoppingCart />}
                    />
                    <Card
                        title="Revenue"
                        value={"$" + totalRevenue.toFixed(2)}
                        description="Total for this month"
                        bgColor="darkblue"
                        icon={<FaMoneyBill />}
                    />
                    <Card
                        title="Products"
                        value={products.length}
                        description="Total for this month"
                        bgColor="green"
                        icon={<FaBox />}
                    />
                    <Card
                        title="Users"
                        value={users.length}
                        description="Total for this month"
                        bgColor="blue"
                        icon={<FaUser />}
                    />
                </div>
                <div className="admin__dashboard-chart">
                    <div style={{ flex: 1 }}>
                        <h3>Sales Over Time</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={salesData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="sales"
                                    stroke="#8884d8"
                                    activeDot={{ r: 8 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3>Revenue Over Time</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getMonthlyRevenues(orders)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="revenue"
                                    stroke="#8884d8"
                                    activeDot={{ r: 8 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div className="admin__dashboard-table">
                    <h3>Top-selling products</h3>
                    <Table responsive striped borderless hover>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Sales</th>
                                <th>Revenue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orderItems.map((product, index) => (
                                <tr>
                                    <td width="50px">
                                        {orderItems.indexOf(product) + 1}
                                    </td>
                                    <td width="500px">{product.name}</td>
                                    <td width="150px">{product.sales}</td>
                                    <td width="150px">${product.revenue}</td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminDashboard;
