import React from "react";
import { Table } from "../../../components/ui/legacy";
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
import AdminTableScrollHint from "./AdminTableScrollHint";
import type { DashboardAvailability } from "../utils/dashboardAvailability";
import { ORDER_STATUS } from "../../orders/orderStatus";
import type { AdminAnalyticsSummary } from "../types";
import { useAdminDashboardCopy } from "../../../hooks/useAdminDashboardCopy";
import { useLocale } from "../../../context/LocaleContext";

type ChartDatum = {
    name: string;
    value: number;
    revenue?: number;
    orders?: number;
    stock?: number;
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

type AccessibleChartDataProps = {
    id: string;
    caption: string;
    headers: string[];
    rows: string[][];
};

const AccessibleChartData = ({ id, caption, headers, rows }: AccessibleChartDataProps) => (
    <p id={id} className="admin__sr-only">
        {caption}. {rows.map((row) => headers.map((header, index) => `${header}: ${row[index]}`).join(", ")).join(". ")}
    </p>
);

type AdminDashboardChartsProps = {
    availability: DashboardAvailability;
    analyticsSummary: AdminAnalyticsSummary | null;
    analyticsTrend: Array<{ name: string; revenue: number; orders: number }>;
    analyticsPaymentMix: ChartDatum[];
    paymentMix: ChartDatum[];
    analyticsStatusMix: ChartDatum[];
    statusMix: ChartDatum[];
    dashboardStats: DashboardStats;
    monthlyTrends: Array<{ name: string; sales: number; revenue: number }>;
    analyticsCategoryRevenue: Array<{ name: string; value: number; units?: number }>;
    categoryRevenue: ChartDatum[];
    topRevenueProducts: TopRevenueProduct[];
    hasAnalyticsKpis: boolean;
    formatCurrency: (value: number) => string;
    formatReportDate: (date?: Date) => string;
    getOrderStatusLabel: (status: number) => string;
    rangeLabel: string;
};

const CHART_COLORS = [
    "var(--de-color-electric)",
    "var(--de-color-success)",
    "var(--de-color-warning)",
    "var(--de-color-danger)",
    "var(--de-color-primary-emphasis)",
    "var(--de-color-info)",
];

const getNetRevenue = (order: DashboardOrder) => order.status === ORDER_STATUS.CANCELED
    ? 0
    : Math.max(order.total_price - order.discount, 0);

const DashboardUnavailable = ({ section }: { section: string }) => {
    const tx = useAdminDashboardCopy();
    return (
        <div className="admin__chart-body" role="status">
            <strong>{tx(section)} {tx("unavailable")}</strong>
            <p>{tx("This section could not be loaded. Refresh to try again.")}</p>
        </div>
    );
};

const AdminDashboardCharts = ({
    availability,
    analyticsSummary,
    analyticsTrend,
    analyticsPaymentMix,
    paymentMix,
    analyticsStatusMix,
    statusMix,
    dashboardStats,
    monthlyTrends,
    analyticsCategoryRevenue,
    categoryRevenue,
    topRevenueProducts,
    hasAnalyticsKpis,
    formatCurrency,
    formatReportDate,
    getOrderStatusLabel,
    rangeLabel,
}: AdminDashboardChartsProps) => {
    const tx = useAdminDashboardCopy();
    const { locale } = useLocale();
    const formatCompactCurrency = (value: number) =>
        `${new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
            notation: "compact",
            maximumFractionDigits: 1,
        }).format(value)} ₫`;

    return (
        <div className="admin__dashboard__secondary">
            <section className="admin__dashboard__activity-grid">
                <div className="admin__card">
                    <div className="admin__card__header">
                        <h3>{tx("Recent activity")}</h3>
                        <span>{tx("Newest orders and customers")}</span>
                    </div>
                    <div className="admin__dashboard__activity">
                        {availability.orders === "error" || availability.users === "error" ? (
                            <DashboardUnavailable section="Recent activity" />
                        ) : null}
                        {availability.orders !== "error" && availability.users !== "error" ? (
                            <>
                                {dashboardStats.latestOrders.slice(0, 3).map((order) => (
                                    <div key={`order-${order.id}`} className="admin__dashboard__activity__item">
                                        <div className="admin__dashboard__activity__icon">
                                            <CheckCircleIcon size={18} />
                                        </div>
                                        <div>
                                            <strong>{tx("Order")} #{order.id}</strong>
                                            <p>{getOrderStatusLabel(order.status)} | {formatCurrency(getNetRevenue(order))}</p>
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
                            </>
                        ) : null}
                    </div>
                </div>
            </section>

            {availability.analytics === "error" ? (
                <section className="admin__dashboard__analysis">
                    <div className="admin__card">
                        <DashboardUnavailable section="Analytics" />
                    </div>
                </section>
            ) : analyticsSummary ? (
                <section className="admin__dashboard__analysis">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>{tx(rangeLabel)} {tx("revenue pulse")}</h3>
                            <span>{tx("Orders and revenue for the selected period")}</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart
                                    data={analyticsTrend}
                                    aria-label={`${tx(rangeLabel)} ${tx("revenue pulse")}`}
                                    aria-describedby="admin-dashboard-revenue-data"
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--de-color-border-strong)" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        width={72}
                                        tickFormatter={(value) => formatCompactCurrency(Number(value || 0))}
                                    />
                                    <Tooltip
                                        formatter={(value, name) => [
                                            name === "revenue" ? formatCurrency(Number(value || 0)) : Number(value || 0),
                                            tx(name === "revenue" ? "Revenue" : "Orders"),
                                        ]}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="var(--de-color-electric)" fill="var(--de-color-info-soft)" strokeWidth={3} />
                                    <Area type="monotone" dataKey="orders" stroke="var(--de-color-success)" fill="var(--de-color-success-soft)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                            <AccessibleChartData
                                id="admin-dashboard-revenue-data"
                                caption={`${tx(rangeLabel)} ${tx("revenue pulse")}`}
                                headers={[tx("Date"), tx("Revenue"), tx("Orders")]}
                                rows={analyticsTrend.map((point) => [point.name, formatCurrency(point.revenue), String(point.orders)])}
                            />
                        </div>
                    </div>

                </section>
            ) : null}

            {availability.orders === "error" ? (
                <section className="admin__dashboard__charts">
                    <div className="admin__card admin__card--wide">
                        <DashboardUnavailable section="Sales and revenue charts" />
                    </div>
                </section>
            ) : (
            <section className="admin__dashboard__charts">
                <div className="admin__card">
                    <div className="admin__card__header">
                        <h3>{tx("Sales momentum")}</h3>
                        <span>{tx("Last 6 months")}</span>
                    </div>
                    <div className="admin__card__body">
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart
                                data={monthlyTrends}
                                aria-label={tx("Sales momentum")}
                                aria-describedby="admin-dashboard-sales-data"
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--de-color-border-strong)" />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                <Tooltip formatter={(value) => [Number(value || 0), tx("Sales")]} />
                                <Line type="monotone" dataKey="sales" stroke="var(--de-color-primary-emphasis)" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                        <AccessibleChartData
                            id="admin-dashboard-sales-data"
                            caption={tx("Sales momentum")}
                            headers={[tx("Month"), tx("Sales")]}
                            rows={monthlyTrends.map((point) => [point.name, String(point.sales)])}
                        />
                    </div>
                </div>
            </section>
            )}

            <section className="admin__dashboard__realtime">
                <div className="admin__dashboard__mix-grid">
                    <div className="admin__card">
                        <div className="admin__card__header">
                            <h3>{tx("Payment mix")}</h3>
                            <span>{tx("All orders")}</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart aria-label={tx("Payment mix")} aria-describedby="admin-dashboard-payment-data">
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
                                    <Tooltip formatter={(value) => [Number(value || 0), tx("Orders")]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <AccessibleChartData
                                id="admin-dashboard-payment-data"
                                caption={tx("Payment mix")}
                                headers={[tx("Payment method"), tx("Orders")]}
                                rows={(analyticsPaymentMix.length > 0 ? analyticsPaymentMix : paymentMix).map((entry) => [entry.name, String(entry.value)])}
                            />
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
                        <h3>{tx("Order status")}</h3>
                        <span>{tx("Fulfillment split")}</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={220}>
                                <PieChart aria-label={tx("Order status")} aria-describedby="admin-dashboard-status-data">
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
                                    <Tooltip formatter={(value) => [Number(value || 0), tx("Orders")]} />
                                </PieChart>
                            </ResponsiveContainer>
                            <AccessibleChartData
                                id="admin-dashboard-status-data"
                                caption={tx("Order status")}
                                headers={[tx("Status"), tx("Orders")]}
                                rows={(analyticsStatusMix.length > 0 ? analyticsStatusMix : statusMix).map((entry) => [entry.name, String(entry.value)])}
                            />
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

            {availability.products === "error" ? (
                <section className="admin__dashboard__analysis">
                    <div className="admin__card">
                        <DashboardUnavailable section="Category analytics" />
                    </div>
                </section>
            ) : (
            <section className="admin__dashboard__analysis">
                <div className="admin__card">
                    <div className="admin__card__header">
                        <h3>{tx("Revenue by category")}</h3>
                        <span>{tx("Top performing product groups")}</span>
                    </div>
                    <div className="admin__card__body admin__chart-body">
                        {availability.orderItems === "error" ? <DashboardUnavailable section="Category analytics" /> : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                                data={analyticsCategoryRevenue.length > 0 ? analyticsCategoryRevenue : categoryRevenue}
                                layout="vertical"
                                margin={{ left: 18 }}
                                aria-label={tx("Revenue by category")}
                                aria-describedby="admin-dashboard-category-data"
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--de-color-border-strong)" />
                                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(value) => formatCurrency(Number(value || 0))} />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tickLine={false}
                                    axisLine={false}
                                    width={120}
                                    tickFormatter={(value) => String(value).slice(0, 18)}
                                />
                                <Tooltip formatter={(value) => [formatCurrency(Number(value || 0)), tx("Revenue")]} />
                                <Bar dataKey="value" fill="var(--de-color-electric)" radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                        )}
                        {availability.orderItems !== "error" ? (
                            <AccessibleChartData
                                id="admin-dashboard-category-data"
                                caption={tx("Revenue by category")}
                                headers={[tx("Category"), tx("Revenue")]}
                                rows={(analyticsCategoryRevenue.length > 0 ? analyticsCategoryRevenue : categoryRevenue).map((entry) => [entry.name, formatCurrency(entry.value)])}
                            />
                        ) : null}
                    </div>
                </div>

            </section>
            )}

            {availability.orderItems === "error" ? (
                <section className="admin__card">
                    <DashboardUnavailable section="Best-selling products" />
                </section>
            ) : (
            <section className="admin__card">
                <div className="admin__card__header">
                    <h3>{tx("Top 10 best-selling products")}</h3>
                    <span>{tx(hasAnalyticsKpis ? "Loaded order-item coverage" : "Loaded order-item snapshot")}</span>
                </div>
                <div className="admin__card__body">
                    <AdminTableScrollHint label={tx("Best-selling products table")}>
                    <Table responsive={false} hover borderless className="admin__table admin__table--dashboard">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>{tx("Name")}</th>
                                <th>{tx("Sales")}</th>
                                <th>{tx("Revenue")}</th>
                                <th>{tx("Avg. Price")}</th>
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
                    </AdminTableScrollHint>
                </div>
            </section>
            )}
        </div>
    );
};

export default AdminDashboardCharts;
