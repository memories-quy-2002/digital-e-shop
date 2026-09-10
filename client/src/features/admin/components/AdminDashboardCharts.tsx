import React from "react";
import { Table } from "../../../components/ui/legacy";
import { Badge } from "../../../components/ui/badge";
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
    operations?: {
        promotions?: {
            discountedOrders?: number;
            totalDiscountGiven?: number;
            discountedRevenue?: number;
            performance?: Array<{
                id: number;
                code: string;
                discountPercent: number;
                discountGiven: number;
                estimatedOrders: number;
                active: boolean;
            }>;
        };
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
    availability: DashboardAvailability;
    analyticsSummary: AnalyticsSummaryLike | null;
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

const getNetRevenue = (order: DashboardOrder) => Math.max(order.total_price - order.discount, 0);

const DashboardUnavailable = ({ section }: { section: string }) => (
    <div className="admin__chart-body" role="status">
        <strong>{section} unavailable</strong>
        <p>This section could not be loaded. Refresh to try again.</p>
    </div>
);

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
    const promotionPerformance = analyticsSummary?.operations?.promotions?.performance || [];

    return (
        <div className="admin__dashboard__secondary">
            {availability.analytics === "error" ? (
                <section className="admin__dashboard__analysis">
                    <div className="admin__card">
                        <DashboardUnavailable section="Analytics" />
                    </div>
                </section>
            ) : analyticsSummary ? (
                <section className="admin__dashboard__analysis admin__dashboard__analysis--overview">
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
                            <h3>{rangeLabel} revenue pulse</h3>
                            <span>Orders and revenue for the selected period</span>
                        </div>
                        <div className="admin__card__body admin__chart-body">
                            <ResponsiveContainer width="100%" height={260}>
                                <AreaChart data={analyticsTrend}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--de-color-border-strong)" />
                                    <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                    <YAxis tickLine={false} axisLine={false} />
                                    <Tooltip
                                        formatter={(value: any, name: any) => [
                                            name === "revenue" ? formatCurrency(Number(value || 0)) : Number(value || 0),
                                            name === "revenue" ? "Revenue" : "Orders",
                                        ]}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="var(--de-color-electric)" fill="var(--de-color-info-soft)" strokeWidth={3} />
                                    <Area type="monotone" dataKey="orders" stroke="var(--de-color-success)" fill="var(--de-color-success-soft)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="admin__card admin__dashboard__promotion-performance">
                        <div className="admin__card__header">
                            <div>
                                <h3>Promotion performance</h3>
                                <span>Redemptions, discount cost, and status by code · {rangeLabel}</span>
                            </div>
                        </div>
                        <div className="admin__dashboard__insights">
                            <div className="admin__dashboard__insight">
                                <span>Discounted orders</span>
                                <strong>{analyticsSummary.operations?.promotions?.discountedOrders ?? 0}</strong>
                                <p>Orders that used a promotion.</p>
                            </div>
                            <div className="admin__dashboard__insight">
                                <span>Discount given</span>
                                <strong>{formatCurrency(analyticsSummary.operations?.promotions?.totalDiscountGiven ?? 0)}</strong>
                                <p>Total discount granted in USD.</p>
                            </div>
                        </div>
                        <div className="admin__card__body">
                            <AdminTableScrollHint label="Promotion performance table">
                            <Table responsive={false} hover borderless className="admin__table admin__table--dashboard admin__table--dashboard-promotion">
                                <caption className="admin__sr-only">Promotion performance by code for {rangeLabel}</caption>
                                <thead><tr><th>Code</th><th>Orders</th><th>Discount given</th><th>Status</th></tr></thead>
                                <tbody>
                                    {promotionPerformance.length > 0 ? promotionPerformance.map((promotion) => (
                                        <tr key={promotion.id}>
                                            <td className="admin__dashboard__promotion-code">{promotion.code}</td>
                                            <td className="admin__table__numeric">{promotion.estimatedOrders}</td>
                                            <td className="admin__table__numeric">{formatCurrency(promotion.discountGiven)}</td>
                                            <td>
                                                <Badge variant={promotion.active ? "default" : "secondary"}>
                                                    {promotion.active ? "Active" : "Inactive"}
                                                </Badge>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4}>
                                                <div className="admin__dashboard__table-empty">
                                                    No promotion activity recorded for this period.
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </Table>
                            </AdminTableScrollHint>
                        </div>
                    </div>
                </section>
            ) : null}

            <section className="admin__dashboard__realtime">
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

            <section className="admin__dashboard__activity-grid">
                <div className="admin__card">
                    <div className="admin__card__header">
                        <h3>Recent activity</h3>
                        <span>Newest orders and customers</span>
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
                            </>
                        ) : null}
                    </div>
                </div>
            </section>

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
                        <h3>Sales momentum</h3>
                        <span>Last 6 months</span>
                    </div>
                    <div className="admin__card__body">
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={monthlyTrends}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--de-color-border-strong)" />
                                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                                <Tooltip formatter={(value: any) => [Number(value || 0), "Sales"]} />
                                <Line type="monotone" dataKey="sales" stroke="var(--de-color-primary-emphasis)" strokeWidth={3} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>
            )}

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
                        <h3>Revenue by category</h3>
                        <span>Top performing product groups</span>
                    </div>
                    <div className="admin__card__body admin__chart-body">
                        {availability.orderItems === "error" ? <DashboardUnavailable section="Category analytics" /> : (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                                data={analyticsCategoryRevenue.length > 0 ? analyticsCategoryRevenue : categoryRevenue}
                                layout="vertical"
                                margin={{ left: 18 }}
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
                                <Tooltip formatter={(value: any) => [formatCurrency(Number(value || 0)), "Revenue"]} />
                                <Bar dataKey="value" fill="var(--de-color-electric)" radius={[0, 8, 8, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                        )}
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
                    <h3>Top 10 best-selling products</h3>
                    <span>{hasAnalyticsKpis ? "Loaded order-item coverage" : "Loaded order-item snapshot"}</span>
                </div>
                <div className="admin__card__body">
                    <AdminTableScrollHint label="Best-selling products table">
                    <Table responsive={false} hover borderless className="admin__table admin__table--dashboard">
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
                    </AdminTableScrollHint>
                </div>
            </section>
            )}
        </div>
    );
};

export default AdminDashboardCharts;
