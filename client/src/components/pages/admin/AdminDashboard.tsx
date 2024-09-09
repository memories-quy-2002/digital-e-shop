import React, { useEffect, useState } from "react";
import {
    FaArrowDown,
    FaArrowUp,
    FaBox,
    FaMoneyBill,
    FaShoppingCart,
    FaUser,
} from "react-icons/fa";
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
    percentage?: number;
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
    price: number;
    order_id: number;
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

type MonthlySales = {
    name: string;
    sales: number;
};

const Card: React.FC<CardProps> = ({
    title,
    value,
    description,
    bgColor,
    percentage,
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
                {percentage && (
                    <strong
                        style={{
                            display: "flex",
                            marginTop: "2px",
                            alignItems: "center",
                            gap: "0.25rem",
                        }}
                    >
                        {percentage > 0 ? (
                            <>
                                <FaArrowUp /> {percentage.toFixed(2)}%
                            </>
                        ) : (
                            <>
                                <FaArrowDown />{" "}
                                {Math.abs(percentage).toFixed(2)}%
                            </>
                        )}
                    </strong>
                )}
            </div>
        </div>
    );
};

const AdminDashboard = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);

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

    const getMonthlySales = (
        orders: Order[],
        orderItems: OrderItem[]
    ): MonthlySales[] => {
        const monthlySalesMap: { [key: string]: number } = {};
        const currentDate = new Date();

        // Initialize sales for the last 6 months
        for (let i = 5; i >= 0; i--) {
            const date = new Date(
                currentDate.getFullYear(),
                currentDate.getMonth() - i,
                1
            );
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;
            monthlySalesMap[monthKey] = 0;
        }

        // Calculate sales for each month based on the OrderItem sales
        orders.forEach((order) => {
            const date = new Date(order.date_added);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;

            // Find all items for the current order
            const itemsInOrder = orderItems.filter(
                (item) => item.order_id === order.id
            );

            if (monthlySalesMap[monthKey] !== undefined) {
                // Sum the sales for all items in this order
                itemsInOrder.forEach((item) => {
                    monthlySalesMap[monthKey] += item.sales;
                });
            }
        });

        // Convert the map into an array of MonthlySales
        return Object.entries(monthlySalesMap).map(([name, sales]) => ({
            name,
            sales,
        }));
    };

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
            revenue: parseFloat(revenue.toFixed(2)),
        }));
    };
    const calculatePercentageChange = (
        currentValue: number,
        previousValue: number
    ): number => {
        return previousValue > 0
            ? ((currentValue - previousValue) / previousValue) * 100
            : 0;
    };

    const revenuePercentageChange = calculatePercentageChange(
        getMonthlyRevenues(orders)[5].revenue,
        getMonthlyRevenues(orders)[4].revenue
    );

    const salesPercentageChange = calculatePercentageChange(
        getMonthlySales(orders, orderItems)[5].sales,
        getMonthlySales(orders, orderItems)[4].sales
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
                        value={getMonthlySales(orders, orderItems)[5].sales}
                        description="Total for this month"
                        bgColor="purple"
                        percentage={salesPercentageChange}
                        icon={<FaShoppingCart />}
                    />
                    <Card
                        title="Revenue"
                        value={
                            "$" +
                            getMonthlyRevenues(orders)[5].revenue.toFixed(2)
                        }
                        description="Total for this month"
                        bgColor="darkblue"
                        percentage={revenuePercentageChange}
                        icon={<FaMoneyBill />}
                    />
                    <Card
                        title="Products"
                        value={products.length}
                        description="Total"
                        bgColor="green"
                        icon={<FaBox />}
                    />
                    <Card
                        title="Users"
                        value={users.length}
                        description="Total"
                        bgColor="blue"
                        icon={<FaUser />}
                    />
                </div>
                <div className="admin__dashboard-chart">
                    <div style={{ flex: 1 }}>
                        <h3>Sales Over Time</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart
                                data={getMonthlySales(orders, orderItems)}
                            >
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
                                <tr key={index}>
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
