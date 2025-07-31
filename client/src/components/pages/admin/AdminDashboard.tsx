import React, { useEffect, useState } from "react";
import { FaArrowDown, FaArrowUp, FaBox, FaMoneyBill, FaShoppingCart, FaUser } from "react-icons/fa";
import axios from "../../../api/axios";
import { Product, Role } from "../../../utils/interface";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

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

const Card: React.FC<CardProps> = ({ title, value, description, bgColor, percentage, icon }) => {
    return (
        <div className="admin__dashboard-card" style={{ backgroundColor: bgColor }}>
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
                                <FaArrowDown /> {Math.abs(percentage).toFixed(2)}%
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
        const fetchData = async () => {
            try {
                // Fetch products
                const productResponse = await axios.get("/api/products/");
                if (productResponse.status === 200) {
                    setProducts(productResponse.data.products);
                }

                const orderResponse = await axios.get(`/api/orders/`);
                if (orderResponse.status === 200) {
                    setOrders(orderResponse.data.orders);
                }

                // Fetch users
                const userResponse = await axios.get(`/api/users/`);
                if (userResponse.status === 200) {
                    setUsers(userResponse.data.accounts);
                }

                // Fetch order items
                const orderItemResponse = await axios.get(`/api/orders/item`);
                if (orderItemResponse.status === 200) {
                    setOrderItems(orderItemResponse.data.orderItems);
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

        // Initialize sales for the last 6 months
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

            // Find all items for the current order
            const itemsInOrder = orderItems.filter((item) => item.order_id === order.id);

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
        const text = `**Report**

**Sales this month:** ${getMonthlySales(orders, orderItems)[5].sales}

**Revenues this month:** $${getMonthlyRevenues(orders)[5].revenue.toFixed(2)}

**Products:** ${products.length}

**Users:** ${users.length}

**Percentage Change**

* **Sales:** ${salesPercentageChange.toFixed(2)}%  (${getMonthlySales(orders, orderItems)[4].sales} -> ${
            getMonthlySales(orders, orderItems)[5].sales
        })
* **Revenue:** ${revenuePercentageChange.toFixed(2)}%  ($${getMonthlyRevenues(orders)[4].revenue.toFixed(
            2
        )} -> $${getMonthlyRevenues(orders)[5].revenue.toFixed(2)})

**Top Revenue Products**

| Product Name | Sales | Revenue |
|---|---|---|
| ${topRevenueProducts[0].name} | ${topRevenueProducts[0].sales} | $${topRevenueProducts[0].revenue.toFixed(2)} |
| ${topRevenueProducts[1].name} | ${topRevenueProducts[1].sales} | $${topRevenueProducts[1].revenue.toFixed(2)} |
| ${topRevenueProducts[2].name} | ${topRevenueProducts[2].sales} | $${topRevenueProducts[2].revenue.toFixed(2)} |
| ... | ... | ... |`;
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
            <main className="admin__dashboard">
                <section className="admin__dashboard-header">
                    <h2>📊 Admin Dashboard Overview</h2>
                    <p style={{ color: "#555", marginBottom: 8 }}>
                        Welcome! Here is a summary of your store's performance and key metrics for the last 6 months.
                    </p>
                    <button className="btn btn-dark" onClick={handleDownloadReport}>
                        Download Detailed Report
                    </button>
                </section>

                <section className="admin__dashboard-summary" style={{ marginBottom: 24 }}>
                    <h4>Summary (This Month)</h4>
                    <ul style={{ display: "flex", flexWrap: "wrap", gap: "2rem", listStyle: "none", padding: 0 }}>
                        <li>
                            <strong>Sales:</strong> {getMonthlySales(orders, orderItems)[5].sales}
                        </li>
                        <li>
                            <strong>Revenue:</strong> ${getMonthlyRevenues(orders)[5].revenue.toFixed(2)}
                        </li>
                        <li>
                            <strong>Products:</strong> {products.length}
                        </li>
                        <li>
                            <strong>Users:</strong> {users.length}
                        </li>
                        <li>
                            <strong>Orders:</strong> {orders.length}
                        </li>
                        <li>
                            <strong>Top Product:</strong> {topRevenueProducts[0]?.name || "N/A"}
                        </li>
                    </ul>
                </section>

                <section className="admin__dashboard-cards">
                    <Card
                        title="Sales"
                        value={getMonthlySales(orders, orderItems)[5].sales}
                        description="Total sales this month"
                        bgColor="purple"
                        percentage={salesPercentageChange}
                        icon={<FaShoppingCart />}
                    />
                    <Card
                        title="Revenue"
                        value={"$" + getMonthlyRevenues(orders)[5].revenue.toFixed(2)}
                        description="Total revenue this month"
                        bgColor="darkblue"
                        percentage={revenuePercentageChange}
                        icon={<FaMoneyBill />}
                    />
                    <Card
                        title="Products"
                        value={products.length}
                        description="Total products in store"
                        bgColor="green"
                        icon={<FaBox />}
                    />
                    <Card
                        title="Users"
                        value={users.length}
                        description="Total registered users"
                        bgColor="blue"
                        icon={<FaUser />}
                    />
                </section>

                <section className="admin__dashboard-chart">
                    <div style={{ flex: 1, marginRight: 24 }}>
                        <h3>📈 Sales Over Time (Last 6 Months)</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getMonthlySales(orders, orderItems)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="sales" stroke="#8884d8" activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3>💰 Revenue Over Time (Last 6 Months)</h3>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={getMonthlyRevenues(orders)}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="revenue" stroke="#82ca9d" activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                <section className="admin__dashboard-table">
                    <h3>🏆 Top 10 Best-Selling Products (All Time)</h3>
                    <Table responsive striped borderless hover>
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
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminDashboard;
