import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Product } from "../../../types/product";
import type { AdminOrder as Order, AdminOrderItem as OrderItem } from "../../../types/order";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import {
    fetchAnalyticsSummary,
    fetchAdminAlerts,
    fetchAdminProducts,
    fetchAdminOrders,
    fetchAdminUsers,
    fetchOrderItems,
    type AdminAlert,
} from "../api";
import AdminDashboardAttention from "../components/AdminDashboardAttention";
import {
    getDashboardUpdateLabel,
    initialDashboardAvailability,
    type DashboardAvailability,
} from "../utils/dashboardAvailability";
import AdminDashboardHeader from "../components/AdminDashboardHeader";
import AdminDashboardKpiGrid, { type AdminDashboardKpi } from "../components/AdminDashboardKpiGrid";
import AdminDashboardOperations from "../components/AdminDashboardOperations";
import { groupAdminAlerts } from "../utils/dashboardAlerts";
import { getDashboardRangeLabel, parseDashboardRange, type DashboardRange } from "../utils/dashboardRange";
import { formatCurrency } from "../../../utils/currency";

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

type AnalyticsSummary = Record<string, any>;

const AdminDashboardCharts = React.lazy(() => import("../components/AdminDashboardCharts"));

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

const normalizeUser = (user: any): { id: string; email: string; username: string; first_name: string | null; last_name: string | null; role: string; created_at: Date } => ({
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
        name: "PayOS",
        value: orders.filter((order) => order.payment_method === "payos").length,
    },
    {
        name: "Stripe",
        value: orders.filter((order) => order.payment_method === "stripe" || order.payment_method === "card").length,
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

const DashboardChartsFallback = () => (
    <section className="admin__dashboard__fallback">
        <div className="admin__card admin__dashboard__fallback__hero">
            <div className="admin__card__header">
                <div className="admin__dashboard__fallback__copy">
                    <span className="admin__dashboard__fallback__eyebrow">Loading analytics</span>
                    <h3>Preparing dashboard visualizations</h3>
                    <p>Revenue, inventory, and fulfillment charts are loading in the background.</p>
                </div>
            </div>
            <div className="admin__dashboard__fallback__stats">
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="admin__dashboard__fallback__stat admin__skeleton" aria-hidden="true" />
                ))}
            </div>
        </div>
        <div className="admin__dashboard__fallback__grid">
            <div className="admin__card">
                <div className="admin__card__body admin__chart-body admin__chart-body--loading">
                    <div className="admin__dashboard__fallback__chart admin__skeleton" aria-hidden="true" />
                </div>
            </div>
            <div className="admin__dashboard__fallback__stack">
                <div className="admin__card">
                    <div className="admin__card__body admin__chart-body admin__chart-body--loading">
                        <div className="admin__dashboard__fallback__chart admin__dashboard__fallback__chart--compact admin__skeleton" aria-hidden="true" />
                    </div>
                </div>
                <div className="admin__card">
                    <div className="admin__card__body admin__chart-body admin__chart-body--loading">
                        <div className="admin__dashboard__fallback__chart admin__dashboard__fallback__chart--compact admin__skeleton" aria-hidden="true" />
                    </div>
                </div>
            </div>
        </div>
    </section>
);

const AdminDashboard = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const range = parseDashboardRange(searchParams.get("range"));
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [users, setUsers] = useState<Array<{ id: string; email: string; username: string; first_name: string | null; last_name: string | null; role: string; created_at: Date }>>([]);
    const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
    const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
    const [alerts, setAlerts] = useState<AdminAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [availability, setAvailability] = useState<DashboardAvailability>(initialDashboardAvailability);
    const { addToast } = useToast();

    const fetchDashboardData = useCallback(async (showToast = false) => {
        try {
            setLoading(true);

            const [analyticsResult, productResult, orderResult, userResult, orderItemResult, alertsResult] = await Promise.allSettled([
                fetchAnalyticsSummary(range),
                fetchAdminProducts(1, 60),
                fetchAdminOrders(1, 80),
                fetchAdminUsers(1, 80),
                fetchOrderItems(1, 120),
                fetchAdminAlerts(),
            ]);

            const results = {
                analytics: analyticsResult,
                products: productResult,
                orders: orderResult,
                users: userResult,
                orderItems: orderItemResult,
                alerts: alertsResult,
            };
            const loadedSections = Object.values(results).filter((result) => result.status === "fulfilled").length;
            const nextAvailability: DashboardAvailability = {
                analytics: analyticsResult.status === "fulfilled" ? "success" : "error",
                products: productResult.status === "fulfilled" ? "success" : "error",
                orders: orderResult.status === "fulfilled" ? "success" : "error",
                users: userResult.status === "fulfilled" ? "success" : "error",
                orderItems: orderItemResult.status === "fulfilled" ? "success" : "error",
                alerts: alertsResult.status === "fulfilled" ? "success" : "error",
            };

            setAvailability(nextAvailability);

            if (analyticsResult.status === "fulfilled") {
                const raw = analyticsResult.value?.summary && typeof analyticsResult.value.summary === "object"
                    ? analyticsResult.value.summary
                    : analyticsResult.value;
                setAnalyticsSummary(raw);
            }

            if (productResult.status === "fulfilled") {
                setProducts(productResult.value || []);
            }

            if (orderResult.status === "fulfilled") {
                setOrders((orderResult.value || []).map(normalizeOrder));
            }

            if (userResult.status === "fulfilled") {
                setUsers((userResult.value || []).map(normalizeUser));
            }

            if (orderItemResult.status === "fulfilled") {
                setOrderItems((orderItemResult.value || []).map(normalizeOrderItem));
            }

            if (alertsResult.status === "fulfilled") {
                setAlerts(alertsResult.value.alerts || []);
            }

            if (loadedSections === 0) {
                addToast("Dashboard", "Unable to load dashboard data.");
                return;
            }

            setLastUpdated(new Date());
            if (nextAvailability.analytics === "error" && showToast) {
                addToast("Dashboard analytics", "Core dashboard loaded, but analytics summary is unavailable.");
            }

            if (showToast) {
                addToast(
                    "Dashboard refresh",
                    loadedSections === 6 ? "Dashboard data refreshed." : "Dashboard loaded with partial data.",
                );
            }
        } catch {
            addToast("Dashboard", "Unable to load dashboard data.");
        } finally {
            setLoading(false);
        }
    }, [addToast, range]);

    const handleRangeChange = useCallback((nextRange: DashboardRange) => {
        setSearchParams({ range: nextRange }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        fetchDashboardData();

        const refreshTimer = window.setInterval(() => {
            fetchDashboardData();
        }, 30000);

        return () => window.clearInterval(refreshTimer);
    }, [fetchDashboardData]);

    const monthlyTrends = useMemo(() => (availability.orders === "success" && availability.orderItems === "success" ? buildMonthlyTrends(orders, orderItems) : []), [availability.orders, availability.orderItems, orders, orderItems]);
    const topRevenueProducts = useMemo(() => (availability.orderItems === "success" ? getTopRevenueProducts(orderItems) : []), [availability.orderItems, orderItems]);
    const paymentMix = useMemo(() => (availability.orders === "success" ? buildPaymentMix(orders) : []), [availability.orders, orders]);
    const statusMix = useMemo(() => (availability.orders === "success" ? buildStatusMix(orders) : []), [availability.orders, orders]);
    const categoryRevenue = useMemo(() => (availability.products === "success" && availability.orderItems === "success" ? buildCategoryRevenue(products, orderItems) : []), [availability.products, availability.orderItems, products, orderItems]);
    const analyticsTrend = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.revenueTrend || analyticsSummary?.revenueTrend || [] : []).map((point: any) => ({
                name: formatUtcDay(new Date(`${point.date}T00:00:00Z`)),
                revenue: Number(point.netRevenue ?? point.revenue) || 0,
                orders: Number(point.orders) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const analyticsCategoryRevenue = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.categoryPerformance || analyticsSummary?.categoryRevenue || [] : []).map((point: any) => ({
                name: point.name,
                value: Number(point.revenue ?? point.value) || 0,
                units: Number(point.units) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const analyticsPaymentMix = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.paymentMethods || [] : []).map((point: any) => ({
                name: point.name === "bank_transfer"
                    ? "Bank transfer"
                    : point.name === "cash"
                      ? "Cash"
                      : point.name === "payos"
                        ? "PayOS"
                        : point.name === "stripe" || point.name === "card"
                          ? "Stripe"
                          : "Unknown",
                value: Number(point.value) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const analyticsStatusMix = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.orderStatusBreakdown || [] : []).map((point: any) => ({
                name: point.name,
                value: Number(point.value) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const hasAnalyticsKpis = availability.analytics === "success" && Boolean(analyticsSummary?.kpis);
    const rangeLabel = getDashboardRangeLabel(range);
    const alertGroups = useMemo(
        () => (availability.alerts === "success" ? groupAdminAlerts(alerts) : []),
        [alerts, availability.alerts],
    );

    const selectedPeriodMetrics = useMemo(() => {
        const revenueComparison = analyticsSummary?.kpis?.revenue?.comparison;
        const orderComparison = analyticsSummary?.kpis?.orders?.comparison;
        const trendRevenue = analyticsTrend.reduce((sum: number, point: ChartDatum) => sum + (point.revenue || 0), 0);
        const trendOrders = analyticsTrend.reduce((sum: number, point: ChartDatum) => sum + (point.orders || 0), 0);
        const currentRevenue = revenueComparison?.current !== undefined ? Number(revenueComparison.current) : trendRevenue;
        const previousRevenue = revenueComparison?.previous !== undefined ? Number(revenueComparison.previous) : 0;
        const currentOrders = orderComparison?.current !== undefined ? Number(orderComparison.current) : trendOrders;
        const previousOrders = orderComparison?.previous !== undefined ? Number(orderComparison.previous) : 0;

        return {
            currentRevenue,
            previousRevenue,
            currentOrders,
            previousOrders,
            revenueDelta: revenueComparison?.deltaPercent !== undefined
                ? Number(revenueComparison.deltaPercent)
                : calculatePercentageChange(currentRevenue, previousRevenue),
            ordersDelta: orderComparison?.deltaPercent !== undefined
                ? Number(orderComparison.deltaPercent)
                : calculatePercentageChange(currentOrders, previousOrders),
        };
    }, [analyticsSummary, analyticsTrend]);

    const dashboardStats = useMemo(() => {
        const pendingOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.pending !== undefined
            ? Number(analyticsSummary.kpis.orders.pending)
            : orders.filter((order) => order.status === 0).length;
        const completedOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.completed !== undefined
            ? Number(analyticsSummary.kpis.orders.completed)
            : orders.filter((order) => order.status === 1).length;
        const cancelledOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.cancelled !== undefined
            ? Number(analyticsSummary.kpis.orders.cancelled)
            : orders.filter((order) => order.status === 2).length;
        const bankTransferOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Bank transfer")?.value ?? orders.filter((order) => order.payment_method === "bank_transfer").length;
        const cashOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Cash")?.value ?? orders.filter((order) => order.payment_method === "cash").length;
        const payosOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "PayOS")?.value ?? orders.filter((order) => order.payment_method === "payos").length;
        const stripeOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Stripe")?.value ?? orders.filter((order) => order.payment_method === "stripe" || order.payment_method === "card").length;
        const totalRevenue = availability.analytics === "success" && analyticsSummary?.kpis?.revenue?.net !== undefined
            ? Number(analyticsSummary.kpis.revenue.net)
            : orders.reduce((sum, order) => sum + getNetRevenue(order), 0);
        const lowStockProducts = (availability.analytics === "success" ? analyticsSummary?.operations?.inventoryRisk || [] : [])
            .filter((product: any) => Number(product.stock) <= 5)
            .sort((a: any, b: any) => Number(a.stock) - Number(b.stock))
            .slice(0, 5);
        const fallbackLowStockProducts = availability.products === "success" ? products
            .filter((product) => product.stock <= 5)
            .sort((a, b) => a.stock - b.stock)
            .slice(0, 5) : [];
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
            payosOrders,
            stripeOrders,
            totalRevenue,
            lowStockProducts: lowStockProducts.length > 0 ? lowStockProducts : fallbackLowStockProducts,
            latestOrders,
            latestUsers,
        };
    }, [analyticsPaymentMix, analyticsSummary, availability.analytics, availability.products, orders, products, users]);

    const primaryKpis = useMemo<AdminDashboardKpi[]>(() => [
        {
            label: "Net revenue",
            value: formatCurrency(selectedPeriodMetrics.currentRevenue),
            description: `${rangeLabel} · after discounts`,
            status: availability.analytics,
            delta: { value: selectedPeriodMetrics.revenueDelta },
        },
        {
            label: "Orders",
            value: analyticsSummary?.kpis?.orders?.total ?? orders.length,
            description: "All recorded orders",
            status: availability.analytics,
            delta: { value: selectedPeriodMetrics.ordersDelta },
        },
        {
            label: "Pending orders",
            value: dashboardStats.pendingOrders,
            description: "Awaiting action",
            status: availability.analytics === "success" ? "success" : availability.orders,
            href: "/admin/orders",
        },
        {
            label: "Low stock",
            value: analyticsSummary?.kpis?.inventory?.lowStock ?? dashboardStats.lowStockProducts.length,
            description: "At or below stock threshold",
            status: availability.analytics === "success" ? "success" : availability.products,
            href: "/admin/products",
        },
    ], [analyticsSummary, availability.analytics, availability.orders, availability.products, dashboardStats.lowStockProducts.length, dashboardStats.pendingOrders, orders.length, rangeLabel, selectedPeriodMetrics]);

    const handleDownloadReport = () => {
        const reportKpisAvailable = availability.analytics === "success";
        const reportActiveProducts = reportKpisAvailable && availability.products === "success"
            ? analyticsSummary?.kpis?.inventory?.totalProducts ?? products.length
            : "Unavailable";
        const reportRegisteredUsers = reportKpisAvailable && availability.users === "success"
            ? analyticsSummary?.kpis?.customers?.total ?? users.length
            : "Unavailable";
        const reportOrdersTracked = reportKpisAvailable && availability.orders === "success"
            ? analyticsSummary?.kpis?.orders?.total ?? orders.length
            : "Unavailable";
        const reportPeriodAvailable = reportKpisAvailable;
        const reportOrders = reportPeriodAvailable ? selectedPeriodMetrics.currentOrders : "Unavailable";
        const reportRevenue = reportPeriodAvailable ? formatCurrency(selectedPeriodMetrics.currentRevenue) : "Unavailable";
        const reportPreviousOrders = reportPeriodAvailable ? selectedPeriodMetrics.previousOrders : "Unavailable";
        const reportPreviousRevenue = reportPeriodAvailable ? formatCurrency(selectedPeriodMetrics.previousRevenue) : "Unavailable";
        const reportOrdersChange = reportPeriodAvailable ? `${selectedPeriodMetrics.ordersDelta.toFixed(2)}%` : "Unavailable";
        const reportRevenueChange = reportPeriodAvailable ? `${selectedPeriodMetrics.revenueDelta.toFixed(2)}%` : "Unavailable";
        const reportOrderPipelineAvailable = reportKpisAvailable && availability.orders === "success";
        const reportPendingOrders = reportOrderPipelineAvailable ? dashboardStats.pendingOrders : "Unavailable";
        const reportCompletedOrders = reportOrderPipelineAvailable ? dashboardStats.completedOrders : "Unavailable";
        const reportCancelledOrders = reportOrderPipelineAvailable ? dashboardStats.cancelledOrders : "Unavailable";
        const reportPaymentMixAvailable = reportKpisAvailable && availability.orders === "success";
        const reportTopProductsAvailable = availability.orderItems === "success";
        const reportLowStockAvailable = availability.products === "success";
        const reportLatestOrdersAvailable = availability.orders === "success";
        const reportLatestUsersAvailable = availability.users === "success";
        const text = [
            "DIGITAL-E OPERATIONS REPORT",
            `Generated at: ${formatReportDate()}`,
            "",
            "OVERVIEW",
            `- Orders tracked: ${reportOrdersTracked}`,
            `- Active products: ${reportActiveProducts}`,
            `- Registered users: ${reportRegisteredUsers}`,
            `- Orders (${rangeLabel}): ${reportOrders}`,
            `- Revenue (${rangeLabel}): ${reportRevenue}`,
            "",
            "MOMENTUM",
            `- Orders change vs previous period: ${reportOrdersChange} (${reportPreviousOrders} -> ${reportOrders})`,
            `- Revenue change vs previous period: ${reportRevenueChange} (${reportPreviousRevenue} -> ${reportRevenue})`,
            "",
            "ORDER PIPELINE",
            `- Pending orders: ${reportPendingOrders}`,
            `- Completed orders: ${reportCompletedOrders}`,
            `- Cancelled orders: ${reportCancelledOrders}`,
            "",
            "PAYMENT MIX",
            `- Bank transfer orders: ${reportPaymentMixAvailable ? dashboardStats.bankTransferOrders : "Unavailable"}`,
            `- Cash orders: ${reportPaymentMixAvailable ? dashboardStats.cashOrders : "Unavailable"}`,
            "",
            "TOP REVENUE PRODUCTS",
            ...(reportTopProductsAvailable
                ? topRevenueProducts.slice(0, 5).map((product, index) => {
                      return `${index + 1}. ${product.name} | Sales: ${product.sales} | Revenue: ${formatCurrency(product.revenue)}`;
                  })
                : ["- Unavailable"]),
            "",
            "LOW STOCK WATCHLIST",
            ...(!reportLowStockAvailable
                ? ["- Unavailable"]
                : dashboardStats.lowStockProducts.length > 0
                  ? dashboardStats.lowStockProducts.map(
                      (product: any, index: number) => `${index + 1}. ${product.name} | Remaining stock: ${product.stock}`,
                    )
                  : ["- No products are currently below the low-stock threshold."]),
            "",
            "LATEST ORDERS",
            ...(!reportLatestOrdersAvailable
                ? ["- Unavailable"]
                : dashboardStats.latestOrders.length > 0
                  ? dashboardStats.latestOrders.map((order) => {
                      return `- Order #${order.id} | ${getOrderStatusLabel(order.status)} | ${formatCurrency(getNetRevenue(order))} | ${formatReportDate(
                          new Date(order.date_added),
                      )}`;
                    })
                  : ["- No recent orders found."]),
            "",
            "NEWEST CUSTOMERS",
            ...(!reportLatestUsersAvailable
                ? ["- Unavailable"]
                : dashboardStats.latestUsers.length > 0
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

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Dashboard | Digital-E</title>
                <meta name="description" content="Overview of store performance and key metrics." />
            </Helmet>
            <main className="admin__page admin__page--dashboard">
                <AdminDashboardHeader
                    range={range}
                    onRangeChange={handleRangeChange}
                    loading={loading}
                    updateLabel={getDashboardUpdateLabel(availability)}
                    lastUpdated={lastUpdated ? lastUpdated.toLocaleTimeString("en-GB") : null}
                    onRefresh={() => fetchDashboardData(true)}
                    onDownloadReport={handleDownloadReport}
                />
                <AdminDashboardAttention
                    status={availability.alerts}
                    groups={alertGroups}
                    onRetry={() => fetchDashboardData(true)}
                />
                <AdminDashboardKpiGrid kpis={primaryKpis} />
                <AdminDashboardOperations
                    pendingOrders={orders.filter((order) => order.status === 0).slice(0, 5)}
                    lowStockProducts={dashboardStats.lowStockProducts}
                    ordersStatus={availability.orders}
                    productsStatus={availability.products}
                    formatCurrency={formatCurrency}
                    formatReportDate={formatReportDate}
                    onRetry={() => fetchDashboardData(true)}
                />

                <Suspense fallback={<DashboardChartsFallback />}>
                    <AdminDashboardCharts
                        availability={availability}
                        analyticsSummary={analyticsSummary}
                        analyticsTrend={analyticsTrend}
                        analyticsPaymentMix={analyticsPaymentMix}
                        paymentMix={paymentMix}
                        analyticsStatusMix={analyticsStatusMix}
                        statusMix={statusMix}
                        dashboardStats={dashboardStats}
                        monthlyTrends={monthlyTrends}
                        analyticsCategoryRevenue={analyticsCategoryRevenue}
                        categoryRevenue={categoryRevenue}
                        topRevenueProducts={topRevenueProducts}
                        hasAnalyticsKpis={hasAnalyticsKpis}
                        formatCurrency={formatCurrency}
                        formatReportDate={formatReportDate}
                        getOrderStatusLabel={getOrderStatusLabel}
                        rangeLabel={rangeLabel}
                    />
                </Suspense>
            </main>
        </AdminLayout>
    );
};

export default AdminDashboard;

