import React from "react";
import { Table } from "react-bootstrap";
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
import { CheckCircleIcon, PersonIcon } from "../../../components/common/Icons";

type ChartDatum = {
    name: string;
    value: number;
    revenue?: number;
    orders?: number;
    stock?: number;
};

type AnalyticsSummaryLike = {
    kpis?: {
        revenue?: {
            averageOrderValue?: number;
        };
        inventory?: {
            lowStock?: number;
            outOfStock?: number;
        };
        customers?: {
            total?: number;
        };
    };
    overview?: {
        average_order_value?: number;
        low_stock?: number;
        out_of_stock?: number;
        customers?: number;
    };
};

type TopRevenueProduct = {
    name: string;
    sales: number;
    revenue: number;
};

type DashboardOrder = {
    id: number;
    date_added: Date;
    status: number;
    total_price: number;
    discount: number;
};

type DashboardUser = {
    id: string;
    username: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    created_at: Date;
};

type DashboardStats = {
    pendingOrders: number;
    completedOrders: number;
    totalRevenue: number;
    lowStockProducts: Array<{ name: string; stock: number }>;
    latestOrders: DashboardOrder[];
    latestUsers: DashboardUser[];
};

type AdminDashboardChartsProps = {
    analyticsSummary: AnalyticsSummaryLike | null;
    analyticsTrend: Array<{ name: string; revenue: number; orders: number }>;
    dailyActivity: ChartDatum[];
    analyticsPaymentMix: ChartDatum[];
    paymentMix: ChartDatum[];
    analyticsStatusMix: ChartDatum[];
    statusMix: ChartDatum[];
    dashboardStats: DashboardStats;
    loading: boolean;
    monthlyTrends: Array<{ name: string; sales: number; revenue: number }>;
    analyticsCategoryRevenue: Array<{ name: string; value: number; units?: number }>;
    categoryRevenue: ChartDatum[];
    analyticsInventoryRisk: ChartDatum[];
    stockRisk: ChartDatum[];
    topRevenueProducts: TopRevenueProduct[];
    hasAnalyticsKpis: boolean;
    formatCurrency: (value: number) => string;
    formatReportDate: (date?: Date) => string;
    getOrderStatusLabel: (status: number) => string;
};

const CHART_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2"];

const getNetRevenue = (order: DashboardOrder) => Math.max(order.total_price - order.discount, 0);

const AdminDashboardCharts = ({
    analyticsSummary,
    analyticsTrend,
    dailyActivity,
    analyticsPaymentMix,
    paymentMix,
    analyticsStatusMix,
    statusMix,
    dashboardStats,
    loading,
    monthlyTrends,
    analyticsCategoryRevenue,
    categoryRevenue,
    analyticsInventoryRisk,
    stockRisk,
    topRevenueProducts,
    hasAnalyticsKpis,
    formatCurrency,
    formatReportDate,
    getOrderStatusLabel,
}: AdminDashboardChartsProps) => {
    return (
        <>
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
                                <strong>
                                    {formatCurrency(
                                        analyticsSummary?.kpis?.revenue?.averageOrderValue ??
                                            analyticsSummary?.overview?.average_order_value ??
                                            0,
                                    )}
                                </strong>
                                <p>Completed orders only.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Low stock</span>
                                <strong>{analyticsSummary?.kpis?.inventory?.lowStock ?? analyticsSummary?.overview?.low_stock ?? 0}</strong>
                                <p>Products with 1-5 units.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Out of stock</span>
                                <strong>{analyticsSummary?.kpis?.inventory?.outOfStock ?? analyticsSummary?.overview?.out_of_stock ?? 0}</strong>
                                <p>Products needing restock now.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Customers</span>
                                <strong>{analyticsSummary?.kpis?.customers?.total ?? analyticsSummary?.overview?.customers ?? 0}</strong>
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
                                <Area type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={3} fill="url(#revenueFill)" />
                                <Area type="monotone" dataKey="orders" stroke="#16a34a" strokeWidth={3} fill="url(#ordersFill)" />
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
                                        data={analyticsPaymentMix.length > 0 ? analyticsPaymentMix : paymentMix}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={52}
                                        outerRadius={78}
                                        paddingAngle={3}
                                    >
                                        {(analyticsPaymentMix.length > 0 ? analyticsPaymentMix : paymentMix).map((entry, index) => (
                                            <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => [Number(value || 0), "Orders"]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="admin__chart-legend">
                                {(analyticsPaymentMix.length > 0 ? analyticsPaymentMix : paymentMix).map((entry, index) => (
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
                                        data={analyticsStatusMix.length > 0 ? analyticsStatusMix : statusMix}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={52}
                                        outerRadius={78}
                                        paddingAngle={3}
                                    >
                                        {(analyticsStatusMix.length > 0 ? analyticsStatusMix : statusMix).map((entry, index) => (
                                            <Cell key={entry.name} fill={CHART_COLORS[(index + 2) % CHART_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value: any) => [Number(value || 0), "Orders"]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="admin__chart-legend">
                                {(analyticsStatusMix.length > 0 ? analyticsStatusMix : statusMix).map((entry, index) => (
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
                            <BarChart data={analyticsInventoryRisk.length > 0 ? analyticsInventoryRisk : stockRisk} layout="vertical" margin={{ left: 18 }}>
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
                    <span>{hasAnalyticsKpis ? "Loaded order-item coverage" : "Loaded order-item snapshot"}</span>
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
        </>
    );
};

export default AdminDashboardCharts;
