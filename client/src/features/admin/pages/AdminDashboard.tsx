import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    BoxSeamIcon,
    CartIcon,
    CashStackIcon,
    CheckCircleIcon,
    PersonIcon,
} from "../../../components/common/Icons";
import axios from "../../../api/axios";
import { Product, Role } from "../../../utils/interface";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Table } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { useToast } from "../../../context/ToastContext";

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
    payment_method?: "bank_transfer" | "cash";
    shipping_address?: string;
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

type TrendPoint = {
    name: string;
    sales: number;
    revenue: number;
};

type ChartDatum = {
    name: string;
    value: number;
    revenue?: number;
    orders?: number;
    stock?: number;
};

type AnalyticsSummary = {
    overview: {
        orders: number;
        revenue: number;
        average_order_value: number;
        customers: number;
        out_of_stock: number;
        low_stock: number;
    };
    revenueTrend: Array<{ date: string; orders: number; revenue: number }>;
    categoryRevenue: Array<{ name: string; revenue: number; units: number }>;
    customerSegments: ChartDatum[];
    inventoryRisk: Array<{ id: number; name: string; stock: number; category: string; brand: string }>;
    promotionPerformance: Array<{
        name: string;
        discount_percent: number;
        discount_given: number;
        estimated_orders: number;
    }>;
};

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value || 0);

const formatReportDate = (date = new Date()) => formatUtcDateTime(date);

const formatUtcMonth = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        year: "numeric",
    }).format(date);

const formatUtcDay = (date: Date) =>
    new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    }).format(date);

const normalizeOrder = (order: any): Order => ({
    ...order,
    id: Number(order.id),
    status: Number(order.status),
    total_price: Number(order.total_price) || 0,
    discount: Number(order.discount) || 0,
    date_added: new Date(order.date_added),
});

const normalizeOrderItem = (orderItem: any): OrderItem => ({
    ...orderItem,
    id: Number(orderItem.id),
    order_id: Number(orderItem.order_id),
    sales: Number(orderItem.sales) || 0,
    revenue: Number(orderItem.revenue) || 0,
    price: Number(orderItem.price) || 0,
});

const normalizeUser = (user: any): User => ({
    ...user,
    created_at: new Date(user.created_at),
});

const getNetRevenue = (order: Order) => Math.max(order.total_price - order.discount, 0);

const buildMonthlyTrends = (orders: Order[], orderItems: OrderItem[]): TrendPoint[] => {
    const monthlyMap = new Map<string, TrendPoint>();
    const currentDate = new Date();
    const salesByOrderId = new Map<number, number>();

    orderItems.forEach((item) => {
        salesByOrderId.set(item.order_id, (salesByOrderId.get(item.order_id) || 0) + item.sales);
    });

    for (let i = 5; i >= 0; i--) {
        const date = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth() - i, 1));
        const label = formatUtcMonth(date);
        monthlyMap.set(label, { name: label, sales: 0, revenue: 0 });
    }

    orders.forEach((order) => {
        const label = formatUtcMonth(new Date(order.date_added));
        const entry = monthlyMap.get(label);

        if (!entry) {
            return;
        }

        entry.sales += salesByOrderId.get(order.id) || 0;
        entry.revenue += getNetRevenue(order);
    });

    return Array.from(monthlyMap.values()).map((entry) => ({
        ...entry,
        revenue: Number(entry.revenue.toFixed(2)),
    }));
};

const getTopRevenueProducts = (orderItems: OrderItem[]) => {
    const revenueMap: Record<string, { name: string; sales: number; revenue: number }> = {};

    orderItems.forEach((item) => {
        if (revenueMap[item.name]) {
            revenueMap[item.name].sales += item.sales;
            revenueMap[item.name].revenue += item.revenue;
            return;
        }

        revenueMap[item.name] = {
            name: item.name,
            sales: item.sales,
            revenue: item.revenue,
        };
    });

    return Object.values(revenueMap).sort((a, b) => b.revenue - a.revenue);
};

const buildDailyActivity = (orders: Order[]): ChartDatum[] => {
    const dailyMap = new Map<string, ChartDatum>();
    const currentDate = new Date();

    for (let i = 6; i >= 0; i--) {
        const date = new Date(Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate() - i));
        const key = date.toISOString().slice(0, 10);
        const label = formatUtcDay(date);
        dailyMap.set(key, { name: label, value: 0, orders: 0, revenue: 0 });
    }

    orders.forEach((order) => {
        const key = new Date(order.date_added).toISOString().slice(0, 10);
        const entry = dailyMap.get(key);

        if (!entry) {
            return;
        }

        entry.orders = (entry.orders || 0) + 1;
        entry.value = entry.orders;
        entry.revenue = Number(((entry.revenue || 0) + getNetRevenue(order)).toFixed(2));
    });

    return Array.from(dailyMap.values());
};

const buildPaymentMix = (orders: Order[]): ChartDatum[] => [
    {
        name: "Bank transfer",
        value: orders.filter((order) => order.payment_method === "bank_transfer").length,
    },
    {
        name: "Cash",
        value: orders.filter((order) => order.payment_method === "cash").length,
    },
    {
        name: "Unknown",
        value: orders.filter((order) => !order.payment_method).length,
    },
].filter((item) => item.value > 0);

const buildStatusMix = (orders: Order[]): ChartDatum[] => [
    { name: "Pending", value: orders.filter((order) => order.status === 0).length },
    { name: "Done", value: orders.filter((order) => order.status === 1).length },
    { name: "Cancelled", value: orders.filter((order) => order.status === 2).length },
].filter((item) => item.value > 0);

const buildCategoryRevenue = (products: Product[], orderItems: OrderItem[]): ChartDatum[] => {
    const productCategoryById = new Map(products.map((product) => [product.id, product.category || "Uncategorized"]));
    const categoryRevenue = new Map<string, number>();

    orderItems.forEach((item) => {
        const category = productCategoryById.get(item.id) || "Uncategorized";
        categoryRevenue.set(category, (categoryRevenue.get(category) || 0) + item.revenue);
    });

    return Array.from(categoryRevenue.entries())
        .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);
};

const buildStockRisk = (products: Product[]): ChartDatum[] =>
    [...products]
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 8)
        .map((product) => ({
            name: product.name,
            value: product.stock,
            stock: product.stock,
        }));

const getOrderStatusLabel = (status: number) => {
    switch (status) {
        case 0:
            return "Pending";
        case 1:
            return "Done";
        case 2:
            return "Cancelled";
        default:
            return "Unknown";
    }
};

const calculatePercentageChange = (currentValue: number, previousValue: number): number => {
    if (previousValue === 0) {
        return currentValue > 0 ? 100 : 0;
    }

    return ((currentValue - previousValue) / previousValue) * 100;
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
                {percentage !== undefined ? (
                    <span className={trendUp ? "trend-up" : "trend-down"}>
                        {trendUp ? <ArrowUpIcon /> : <ArrowDownIcon />}
                        {Math.abs(percentage).toFixed(2)}%
                    </span>
                ) : null}
            </div>
        </div>
    );
};

const AdminDashboard = () => {
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const { addToast } = useToast();

    const fetchDashboardData = useCallback(async (showToast = false) => {
        try {
            setLoading(true);

            const [productResponse, orderResponse, userResponse, orderItemResponse] = await Promise.allSettled([
                axios.get("/api/products"),
                axios.get("/api/orders"),
                axios.get("/api/users"),
                axios.get("/api/orders/item"),
            ]);

            let loadedSections = 0;

            if (productResponse.status === "fulfilled") {
                setProducts(productResponse.value.data.products || []);
                loadedSections += 1;
            }

            if (orderResponse.status === "fulfilled") {
                setOrders((orderResponse.value.data.orders || []).map(normalizeOrder));
                loadedSections += 1;
            }

            if (userResponse.status === "fulfilled") {
                setUsers((userResponse.value.data.accounts || []).map(normalizeUser));
                loadedSections += 1;
            }

            if (orderItemResponse.status === "fulfilled") {
                const orderItemsData = orderItemResponse.value.data.orderItems ?? orderItemResponse.value.data.order_items ?? [];
                setOrderItems(orderItemsData.map(normalizeOrderItem));
                loadedSections += 1;
            }

            if (loadedSections === 0) {
                addToast("Dashboard", "Unable to load dashboard data.");
                return;
            }

            setLastUpdated(new Date());

            axios
                .get("/api/analytics/summary")
                .then((analyticsResponse) => {
                    setAnalyticsSummary(analyticsResponse.data);
                })
                .catch(() => {
                    setAnalyticsSummary(null);
                    if (showToast) {
                        addToast("Dashboard analytics", "Core dashboard loaded, but analytics summary is unavailable.");
                    }
                });

            if (showToast) {
                addToast(
                    "Dashboard",
                    loadedSections === 4 ? "Dashboard data refreshed." : "Dashboard loaded with partial data.",
                );
            }
        } catch {
            addToast("Dashboard", "Unable to load dashboard data.");
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchDashboardData();

        const refreshTimer = window.setInterval(() => {
            fetchDashboardData();
        }, 30000);

        return () => window.clearInterval(refreshTimer);
    }, [fetchDashboardData]);

    const monthlyTrends = useMemo(() => buildMonthlyTrends(orders, orderItems), [orders, orderItems]);
    const topRevenueProducts = useMemo(() => getTopRevenueProducts(orderItems), [orderItems]);
    const dailyActivity = useMemo(() => buildDailyActivity(orders), [orders]);
    const paymentMix = useMemo(() => buildPaymentMix(orders), [orders]);
    const statusMix = useMemo(() => buildStatusMix(orders), [orders]);
    const categoryRevenue = useMemo(() => buildCategoryRevenue(products, orderItems), [products, orderItems]);
    const stockRisk = useMemo(() => buildStockRisk(products), [products]);
    const analyticsTrend = useMemo(
        () =>
            (analyticsSummary?.revenueTrend || []).map((point) => ({
                name: formatUtcDay(new Date(`${point.date}T00:00:00Z`)),
                revenue: Number(point.revenue) || 0,
                orders: Number(point.orders) || 0,
            })),
        [analyticsSummary],
    );
    const analyticsCategoryRevenue = useMemo(
        () =>
            (analyticsSummary?.categoryRevenue || []).map((point) => ({
                name: point.name,
                value: Number(point.revenue) || 0,
                units: Number(point.units) || 0,
            })),
        [analyticsSummary],
    );

    const thisMonth = monthlyTrends[5] || { name: "", sales: 0, revenue: 0 };
    const previousMonth = monthlyTrends[4] || { name: "", sales: 0, revenue: 0 };

    const salesPercentageChange = useMemo(
        () => calculatePercentageChange(thisMonth.sales, previousMonth.sales),
        [thisMonth.sales, previousMonth.sales],
    );
    const revenuePercentageChange = useMemo(
        () => calculatePercentageChange(thisMonth.revenue, previousMonth.revenue),
        [thisMonth.revenue, previousMonth.revenue],
    );

    const dashboardStats = useMemo(() => {
        const pendingOrders = orders.filter((order) => order.status === 0).length;
        const completedOrders = orders.filter((order) => order.status === 1).length;
        const cancelledOrders = orders.filter((order) => order.status === 2).length;
        const bankTransferOrders = orders.filter((order) => order.payment_method === "bank_transfer").length;
        const cashOrders = orders.filter((order) => order.payment_method === "cash").length;
        const totalRevenue = orders.reduce((sum, order) => sum + getNetRevenue(order), 0);
        const lowStockProducts = products
            .filter((product) => product.stock <= 5)
            .sort((a, b) => a.stock - b.stock)
            .slice(0, 5);
        const latestOrders = [...orders]
            .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
            .slice(0, 5);
        const latestUsers = [...users]
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5);

        return {
            pendingOrders,
            completedOrders,
            cancelledOrders,
            bankTransferOrders,
            cashOrders,
            totalRevenue,
            lowStockProducts,
            latestOrders,
            latestUsers,
        };
    }, [orders, products, users]);

    const handleDownloadReport = () => {
        const text = [
            "DIGITAL-E OPERATIONS REPORT",
            `Generated at: ${formatReportDate()}`,
            "",
            "OVERVIEW",
            `- Orders tracked: ${orders.length}`,
            `- Active products: ${products.length}`,
            `- Registered users: ${users.length}`,
            `- Sales this month: ${thisMonth.sales}`,
            `- Revenue this month: ${formatCurrency(thisMonth.revenue)}`,
            "",
            "MOMENTUM",
            `- Sales change vs last month: ${salesPercentageChange.toFixed(2)}% (${previousMonth.sales} -> ${thisMonth.sales})`,
            `- Revenue change vs last month: ${revenuePercentageChange.toFixed(2)}% (${formatCurrency(previousMonth.revenue)} -> ${formatCurrency(thisMonth.revenue)})`,
            "",
            "ORDER PIPELINE",
            `- Pending orders: ${dashboardStats.pendingOrders}`,
            `- Completed orders: ${dashboardStats.completedOrders}`,
            `- Cancelled orders: ${dashboardStats.cancelledOrders}`,
            "",
            "PAYMENT MIX",
            `- Bank transfer orders: ${dashboardStats.bankTransferOrders}`,
            `- Cash orders: ${dashboardStats.cashOrders}`,
            "",
            "TOP REVENUE PRODUCTS",
            ...topRevenueProducts.slice(0, 5).map((product, index) => {
                return `${index + 1}. ${product.name} | Sales: ${product.sales} | Revenue: ${formatCurrency(product.revenue)}`;
            }),
            "",
            "LOW STOCK WATCHLIST",
            ...(dashboardStats.lowStockProducts.length > 0
                ? dashboardStats.lowStockProducts.map(
                      (product, index) => `${index + 1}. ${product.name} | Remaining stock: ${product.stock}`,
                  )
                : ["- No products are currently below the low-stock threshold."]),
            "",
            "LATEST ORDERS",
            ...(dashboardStats.latestOrders.length > 0
                ? dashboardStats.latestOrders.map((order) => {
                      return `- Order #${order.id} | ${getOrderStatusLabel(order.status)} | ${formatCurrency(getNetRevenue(order))} | ${formatReportDate(
                          new Date(order.date_added),
                      )}`;
                  })
                : ["- No recent orders found."]),
            "",
            "NEWEST CUSTOMERS",
            ...(dashboardStats.latestUsers.length > 0
                ? dashboardStats.latestUsers.map((user) => {
                      const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username;
                      return `- ${name} | ${user.email} | Joined ${formatReportDate(new Date(user.created_at))}`;
                  })
                : ["- No recent users found."]),
            "",
        ].join("\n");

        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "digital-e-operations-report.txt";
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportRevenueCsv = () => {
        const rows = [
            ["month", "sales", "revenue"],
            ...monthlyTrends.map((trend) => [trend.name, String(trend.sales), trend.revenue.toFixed(2)]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "digital-e-revenue.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

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
                            Real-time store signals for sales, revenue, fulfillment, inventory risk, and customer
                            activity across the whole store.
                        </p>
                    </div>
                    <div className="admin__dashboard__hero__actions">
                        <span className="admin__dashboard__live">
                            <i />
                            {loading ? "Refreshing" : `Updated ${lastUpdated ? lastUpdated.toLocaleTimeString("en-GB") : "now"}`}
                        </span>
                        <button
                            type="button"
                            className="admin__dashboard__hero__action admin__dashboard__hero__action--secondary"
                            onClick={() => fetchDashboardData(true)}
                            disabled={loading}
                        >
                            Refresh
                        </button>
                        <button className="admin__dashboard__hero__action" onClick={handleDownloadReport}>
                            Download Detailed Report
                        </button>
                        <button
                            type="button"
                            className="admin__dashboard__hero__action"
                            onClick={handleExportRevenueCsv}
                        >
                            Export Revenue CSV
                        </button>
                    </div>
                </section>

                <section className="admin__dashboard__summary">
                    <div>
                        <span>Sales</span>
                        <strong>{thisMonth.sales}</strong>
                        <p>{thisMonth.name || "Current month"}</p>
                    </div>
                    <div>
                        <span>Revenue</span>
                        <strong>{formatCurrency(thisMonth.revenue)}</strong>
                        <p>Net after discounts</p>
                    </div>
                    <div>
                        <span>Products</span>
                        <strong>{products.length}</strong>
                        <p>Active listings</p>
                    </div>
                    <div>
                        <span>Users</span>
                        <strong>{users.length}</strong>
                        <p>Registered accounts</p>
                    </div>
                    <div>
                        <span>Orders</span>
                        <strong>{orders.length}</strong>
                        <p>All recorded orders</p>
                    </div>
                    <div>
                        <span>Top product</span>
                        <strong>{topRevenueProducts[0]?.name || "N/A"}</strong>
                        <p>Highest revenue earner</p>
                    </div>
                </section>

                <section className="admin__dashboard__metrics">
                    <Card
                        title="Sales"
                        value={thisMonth.sales}
                        description="Units sold this month"
                        accent="purple"
                        percentage={salesPercentageChange}
                        icon={<CartIcon />}
                    />
                    <Card
                        title="Revenue"
                        value={formatCurrency(thisMonth.revenue)}
                        description="Net revenue this month"
                        accent="blue"
                        percentage={revenuePercentageChange}
                        icon={<CashStackIcon />}
                    />
                    <Card
                        title="Products"
                        value={products.length}
                        description="Live items in catalog"
                        accent="green"
                        icon={<BoxSeamIcon />}
                    />
                    <Card
                        title="Users"
                        value={users.length}
                        description="Registered customer accounts"
                        accent="teal"
                        icon={<PersonIcon />}
                    />
                </section>

                {analyticsSummary ? (
                    <section className="admin__dashboard__analysis">
                        <div className="admin__card">
                            <div className="admin__card__header">
                                <div>
                                    <h3>Executive analytics</h3>
                                    <span>Server-calculated business health</span>
                                </div>
                            </div>
                            <div className="admin__dashboard__insights">
                                <div className="admin__dashboard__insight">
                                    <span>Average order value</span>
                                    <strong>{formatCurrency(analyticsSummary.overview.average_order_value)}</strong>
                                    <p>Completed orders only.</p>
                                </div>
                                <div className="admin__dashboard__insight">
                                    <span>Low stock</span>
                                    <strong>{analyticsSummary.overview.low_stock}</strong>
                                    <p>Products with 1-5 units.</p>
                                </div>
                                <div className="admin__dashboard__insight">
                                    <span>Out of stock</span>
                                    <strong>{analyticsSummary.overview.out_of_stock}</strong>
                                    <p>Products needing restock now.</p>
                                </div>
                                <div className="admin__dashboard__insight">
                                    <span>Customers</span>
                                    <strong>{analyticsSummary.overview.customers}</strong>
                                    <p>Customer accounts only.</p>
                                </div>
                            </div>
                        </div>

                        <div className="admin__card">
                            <div className="admin__card__header">
                                <h3>14-day revenue pulse</h3>
                                <span>Orders and revenue</span>
                            </div>
                            <div className="admin__card__body admin__chart-body">
                                <ResponsiveContainer width="100%" height={260}>
                                    <AreaChart data={analyticsTrend}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                        <YAxis tickLine={false} axisLine={false} />
                                        <Tooltip
                                            formatter={(value: any, name: any) => [
                                                name === "revenue" ? formatCurrency(Number(value || 0)) : Number(value || 0),
                                                name === "revenue" ? "Revenue" : "Orders",
                                            ]}
                                        />
                                        <Area type="monotone" dataKey="revenue" stroke="#2563eb" fill="#dbeafe" strokeWidth={3} />
                                        <Area type="monotone" dataKey="orders" stroke="#16a34a" fill="#dcfce7" strokeWidth={3} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>
                ) : null}

                <section className="admin__dashboard__realtime">
                    <div className="admin__card admin__card--wide">
                        <div className="admin__card__header">
                            <div>
                                <h3>Live order activity</h3>
                                <span>Revenue and order count across the last 7 days</span>
                            </div>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={dailyActivity}>
                                    <defs>
                                        <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
                                        </linearGradient>
                                        <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0.02} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} />
                                    <Tooltip
                                        formatter={(value: any, name: any) => [
                                            name === "revenue" ? formatCurrency(Number(value || 0)) : Number(value || 0),
                                            name === "revenue" ? "Revenue" : "Orders",
                                        ]}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        stroke="#2563eb"
                                        strokeWidth={3}
                                        fill="url(#revenueFill)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="orders"
                                        stroke="#16a34a"
                                        strokeWidth={3}
                                        fill="url(#ordersFill)"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="admin__dashboard__mix-grid">
                        <div className="admin__card">
                            <div className="admin__card__header">
                                <h3>Payment mix</h3>
                                <span>All orders</span>
                            </div>
                            <div className="admin__card__body admin__chart-body">
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={paymentMix}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={52}
                                            outerRadius={78}
                                            paddingAngle={3}
                                        >
                                            {paymentMix.map((entry, index) => (
                                                <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any) => [Number(value || 0), "Orders"]} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="admin__chart-legend">
                                    {paymentMix.map((entry, index) => (
                                        <span key={entry.name}>
                                            <i style={{ background: CHART_COLORS[index % CHART_COLORS.length] }} />
                                            {entry.name}: {entry.value}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="admin__card">
                            <div className="admin__card__header">
                                <h3>Order status</h3>
                                <span>Fulfillment split</span>
                            </div>
                            <div className="admin__card__body admin__chart-body">
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={statusMix}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={52}
                                            outerRadius={78}
                                            paddingAngle={3}
                                        >
                                            {statusMix.map((entry, index) => (
                                                <Cell key={entry.name} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip formatter={(value: any) => [Number(value || 0), "Orders"]} />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="admin__chart-legend">
                                    {statusMix.map((entry, index) => (
                                        <span key={entry.name}>
                                            <i style={{ background: CHART_COLORS[(index + 2) % CHART_COLORS.length] }} />
                                            {entry.name}: {entry.value}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="admin__dashboard__highlights">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Operations health</h3>
                            <span>{loading ? "Loading..." : "Live snapshot"}</span>
                        </div>
                        <div className="admin__dashboard__insights">
                            <div className="admin__dashboard__insight">
                                <span>Pending orders</span>
                                <strong>{dashboardStats.pendingOrders}</strong>
                                <p>Orders still waiting for action.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Completed orders</span>
                                <strong>{dashboardStats.completedOrders}</strong>
                                <p>Orders already fulfilled successfully.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Low stock watch</span>
                                <strong>{dashboardStats.lowStockProducts.length}</strong>
                                <p>Products with 5 or fewer units left.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Total revenue</span>
                                <strong>{formatCurrency(dashboardStats.totalRevenue)}</strong>
                                <p>All-time net revenue from completed purchases.</p>
                            </div>
                        </div>
                    </div>

                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Recent activity</h3>
                            <span>Newest orders and customers</span>
                        </div>
                        <div className="admin__dashboard__activity">
                            {dashboardStats.latestOrders.slice(0, 3).map((order) => (
                                <div key={`order-${order.id}`} className="admin__dashboard__activity__item">
                                    <div className="admin__dashboard__activity__icon">
                                        <CheckCircleIcon size={18} />
                                    </div>
                                    <div>
                                        <strong>Order #{order.id}</strong>
                                        <p>
                                            {getOrderStatusLabel(order.status)} | {formatCurrency(getNetRevenue(order))}
                                        </p>
                                    </div>
                                    <span>{formatReportDate(new Date(order.date_added))}</span>
                                </div>
                            ))}
                            {dashboardStats.latestUsers.slice(0, 2).map((user) => {
                                const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username;
                                return (
                                    <div key={`user-${user.id}`} className="admin__dashboard__activity__item">
                                        <div className="admin__dashboard__activity__icon admin__dashboard__activity__icon--user">
                                            <PersonIcon size={18} />
                                        </div>
                                        <div>
                                            <strong>{name}</strong>
                                            <p>{user.email}</p>
                                        </div>
                                        <span>{formatReportDate(new Date(user.created_at))}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section className="admin__dashboard__charts">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Sales momentum</h3>
                            <span>Last 6 months</span>
                        </div>
                        <div className="admin__card__body">
                            <ResponsiveContainer width="100%" height={260}>
                                <LineChart data={monthlyTrends}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                    <Tooltip formatter={(value: any) => [Number(value || 0), "Sales"]} />
                                    <Line type="monotone" dataKey="sales" stroke="#7c3aed" strokeWidth={3} dot={false} />
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
                                <LineChart data={monthlyTrends}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                    <Tooltip formatter={(value: any) => [formatCurrency(Number(value || 0)), "Revenue"]} />
                                    <Line type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={3} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </section>

                <section className="admin__dashboard__analysis">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Revenue by category</h3>
                            <span>Top performing product groups</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart
                                    data={analyticsCategoryRevenue.length > 0 ? analyticsCategoryRevenue : categoryRevenue}
                                    layout="vertical"
                                    margin={{ left: 18 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        width={120}
                                        tickFormatter={(value) => String(value).slice(0, 18)}
                                    />
                                    <Tooltip formatter={(value: any) => [formatCurrency(Number(value || 0)), "Revenue"]} />
                                    <Bar dataKey="value" fill="#2563eb" radius={[0, 8, 8, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>Inventory risk</h3>
                            <span>Lowest stock items</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={stockRisk} layout="vertical" margin={{ left: 18 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        tickLine={false}
                                        axisLine={false}
                                        width={120}
                                        tickFormatter={(value) => String(value).slice(0, 18)}
                                    />
                                    <Tooltip formatter={(value: any) => [Number(value || 0), "Stock"]} />
                                    <Bar dataKey="stock" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                                </BarChart>
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
                                    <tr key={product.name}>
                                        <td width="50px">{index + 1}</td>
                                        <td width="350px">{product.name}</td>
                                        <td width="120px">{product.sales}</td>
                                        <td width="150px">{formatCurrency(product.revenue)}</td>
                                        <td width="120px">{formatCurrency(product.revenue / Math.max(product.sales, 1))}</td>
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

