import React, { useEffect, useState } from "react";
import { FaArrowDown, FaArrowUp, FaBox, FaMoneyBill, FaShoppingCart, FaUser } from "react-icons/fa";
import axios from "../../../api/axios";
import { Product, Role } from "../../../utils/interface";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

import AdminLayout from "../../layout/AdminLayout";
import { Table } from "react-bootstrap";
import { Helmet } from "react-helmet";

interface CardProps {
    title: string;
    value: number | string;
    description: string;
    accent: "purple" | "blue" | "green" | "teal";
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

const Card: React.FC<CardProps> = ({ title, value, description, accent, percentage, icon }) => {
    const trendUp = percentage !== undefined && percentage >= 0;
    return (
        <div className={`admin__metric-card admin__metric-card--${accent}`}>
            <div className="admin__metric-card__header">
                <div className="admin__metric-card__icon">{icon}</div>
                <div className="admin__metric-card__title">
                    <span>{title}</span>
                    <strong>{value}</strong>
                </div>
            </div>
            <div className="admin__metric-card__footer">
                <p>{description}</p>
                {percentage !== undefined && (
                    <span className={trendUp ? "trend-up" : "trend-down"}>
                        {trendUp ? <FaArrowUp /> : <FaArrowDown />}
                        {Math.abs(percentage).toFixed(2)}%
                    </span>
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
        const fetchData = async () => {
            try {
                const productResponse = await axios.get("/api/products/");
                if (productResponse.status === 200) {
                    setProducts(productResponse.data.products);
                }

                const orderResponse = await axios.get(`/api/orders/`);
                if (orderResponse.status === 200) {
                    setOrders(orderResponse.data.orders);
                }

                const userResponse = await axios.get(`/api/users/`);
                if (userResponse.status === 200) {
                    setUsers(userResponse.data.accounts);
                }

                const orderItemResponse = await axios.get(`/api/orders/item`);
                if (orderItemResponse.status === 200) {
                    setOrderItems(orderItemResponse.data.orderItems);
                } else if (orderItemResponse.status === 500) {
                    console.error("Internal server error: ", orderItemResponse.data.msg);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchData();
    }, []);

    const getMonthlySales = (orders: Order[], orderItems: OrderItem[]): MonthlySales[] => {
        const monthlySalesMap: { [key: string]: number } = {};
        const currentDate = new Date();

        for (let i = 5; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;
            monthlySalesMap[monthKey] = 0;
        }

        orders.forEach((order) => {
            const date = new Date(order.date_added);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;

            const itemsInOrder = orderItems.filter((item) => item.order_id === order.id);

            if (monthlySalesMap[monthKey] !== undefined) {
                itemsInOrder.forEach((item) => {
                    monthlySalesMap[monthKey] += item.sales;
                });
            }
        });

        return Object.entries(monthlySalesMap).map(([name, sales]) => ({
            name,
            sales,
        }));
    };

    const getMonthlyRevenues = (orders: Order[]): MonthlyRevenue[] => {
        const monthlyRevenueMap: { [key: string]: number } = {};
        const currentDate = new Date();

        for (let i = 5; i >= 0; i--) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;
            monthlyRevenueMap[monthKey] = 0;
        }

        orders.forEach((order) => {
            const date = new Date(order.date_added);
            const month = date.toLocaleString("default", { month: "long" });
            const year = date.getFullYear();
            const monthKey = `${month} ${year}`;

            if (monthlyRevenueMap[monthKey] !== undefined) {
                monthlyRevenueMap[monthKey] += order.subtotal;
            }
        });

        return Object.entries(monthlyRevenueMap).map(([name, revenue]) => ({
            name,
            revenue: parseFloat(revenue.toFixed(2)),
        }));
    };

    const getTopRevenueProducts = (order_items: OrderItem[]) => {
        const revenueMap: {
            [key: string]: { name: string; sales: number; revenue: number };
        } = {};

        order_items.forEach((item) => {
            if (revenueMap[item.name]) {
                revenueMap[item.name].sales += item.sales;
                revenueMap[item.name].revenue += item.revenue;
            } else {
                revenueMap[item.name] = {
                    name: item.name,
                    sales: item.sales,
                    revenue: item.revenue,
                };
            }
        });

        const sortedItems = Object.values(revenueMap).sort((a, b) => b.revenue - a.revenue);
        return sortedItems;
    };

    const handleDownloadReport = () => {
        const text = `**Report**\n\n**Sales this month:** ${getMonthlySales(orders, orderItems)[5].sales}\n\n**Revenues this month:** $${getMonthlyRevenues(orders)[5].revenue.toFixed(2)}\n\n**Products:** ${products.length}\n\n**Users:** ${users.length}\n\n**Percentage Change**\n\n* **Sales:** ${salesPercentageChange.toFixed(2)}%  (${getMonthlySales(orders, orderItems)[4].sales} -> ${
            getMonthlySales(orders, orderItems)[5].sales
        })\n* **Revenue:** ${revenuePercentageChange.toFixed(2)}%  ($${getMonthlyRevenues(orders)[4].revenue.toFixed(
            2
        )} -> $${getMonthlyRevenues(orders)[5].revenue.toFixed(2)})\n\n**Top Revenue Products**\n\n| Product Name | Sales | Revenue |\n|---|---|---|\n| ${topRevenueProducts[0]?.name || ""} | ${topRevenueProducts[0]?.sales || 0} | $${(
            topRevenueProducts[0]?.revenue || 0
        ).toFixed(2)} |\n| ${topRevenueProducts[1]?.name || ""} | ${topRevenueProducts[1]?.sales || 0} | $${(
            topRevenueProducts[1]?.revenue || 0
        ).toFixed(2)} |\n| ${topRevenueProducts[2]?.name || ""} | ${topRevenueProducts[2]?.sales || 0} | $${(
            topRevenueProducts[2]?.revenue || 0
        ).toFixed(2)} |\n| ... | ... | ... |`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "report.txt";
        a.click();
        URL.revokeObjectURL(url);
    };

    const calculatePercentageChange = (currentValue: number, previousValue: number): number => {
        return previousValue > 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0;
    };

    const revenuePercentageChange = calculatePercentageChange(
        getMonthlyRevenues(orders)[5].revenue,
        getMonthlyRevenues(orders)[4].revenue
    );

    const salesPercentageChange = calculatePercentageChange(
        getMonthlySales(orders, orderItems)[5].sales,
        getMonthlySales(orders, orderItems)[4].sales
    );

    const topRevenueProducts = getTopRevenueProducts(orderItems);

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Dashboard | Digital-E</title>
                <meta name="description" content="Overview of store performance and key metrics." />
            </Helmet>
            <main className="admin__page admin__page--dashboard">
                <section className="admin__dashboard__hero">
                    <div>
                        <span className="admin__dashboard__hero__eyebrow">Store performance</span>
                        <h2 className="admin__dashboard__hero__title">Admin Dashboard</h2>
                        <p className="admin__dashboard__hero__subtitle">
                            A complete snapshot of revenue, sales momentum, and customer activity over the last 6 months.
                        </p>
                    </div>
                    <div className="admin__dashboard__hero__actions">
                        <button className="admin__dashboard__hero__action" onClick={handleDownloadReport}>
                            Download Report
                        </button>
                    </div>
                </section>

                <section className="admin__dashboard__summary">
                    <div>
                        <span>Sales</span>
                        <strong>{getMonthlySales(orders, orderItems)[5].sales}</strong>
                        <p>This month</p>
                    </div>
                    <div>
                        <span>Revenue</span>
                        <strong>${getMonthlyRevenues(orders)[5].revenue.toFixed(2)}</strong>
                        <p>This month</p>
                    </div>
                    <div>
                        <span>Products</span>
                        <strong>{products.length}</strong>
                        <p>Active listings</p>
                    </div>
                    <div>
                        <span>Users</span>
                        <strong>{users.length}</strong>
                        <p>Registered</p>
                    </div>
                    <div>
                        <span>Orders</span>
                        <strong>{orders.length}</strong>
                        <p>All time</p>
                    </div>
                    <div>
                        <span>Top product</span>
                        <strong>{topRevenueProducts[0]?.name || "N/A"}</strong>
                        <p>Highest revenue</p>
                    </div>
                </section>

                <section className="admin__dashboard__metrics">
                    <Card
                        title="Sales"
                        value={getMonthlySales(orders, orderItems)[5].sales}
                        description="Sales this month"
                        accent="purple"
                        percentage={salesPercentageChange}
                        icon={<FaShoppingCart />}
                    />
                    <Card
                        title="Revenue"
                        value={`$${getMonthlyRevenues(orders)[5].revenue.toFixed(2)}`}
                        description="Revenue this month"
                        accent="blue"
                        percentage={revenuePercentageChange}
                        icon={<FaMoneyBill />}
                    />
                    <Card
                        title="Products"
                        value={products.length}
                        description="Active listings"
                        accent="green"
                        icon={<FaBox />}
                    />
                    <Card
                        title="Users"
                        value={users.length}
                        description="Registered accounts"
                        accent="teal"
                        icon={<FaUser />}
                    />
                </section>

                <section className="admin__dashboard__charts">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Sales momentum</h3>
                            <span>Last 6 months</span>
                        </div>
                        <div className="admin__card__body">
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={getMonthlySales(orders, orderItems)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="sales" stroke="#7c3aed" activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Revenue trend</h3>
                            <span>Last 6 months</span>
                        </div>
                        <div className="admin__card__body">
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={getMonthlyRevenues(orders)}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <h3>Top 10 best-selling products</h3>
                        <span>All time</span>
                    </div>
                    <div className="admin__card__body">
                        <Table responsive hover borderless>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Sales</th>
                                    <th>Revenue</th>
                                    <th>Avg. Price</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topRevenueProducts.slice(0, 10).map((product, index) => (
                                    <tr key={index}>
                                        <td width="50px">{index + 1}</td>
                                        <td width="350px">{product.name}</td>
                                        <td width="120px">{product.sales}</td>
                                        <td width="150px">${product.revenue.toFixed(2)}</td>
                                        <td width="120px">${(product.revenue / (product.sales || 1)).toFixed(2)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminDashboard;
