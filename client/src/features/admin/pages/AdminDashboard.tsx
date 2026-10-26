import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Product } from "../../../types/product";
import type { AdminAccount, AdminOrder as Order } from "../../../types/order";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import {
    fetchAnalyticsSummary,
    fetchAdminAlerts,
    fetchAdminProducts,
    fetchAdminOrders,
    fetchAdminPendingOrderQueue,
    fetchAdminUsers,
    acknowledgeAdminAlerts,
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
import { groupAdminAlerts } from "../utils/dashboardAlerts";
import { getDashboardRangeLabel, parseDashboardRange, type DashboardRange } from "../utils/dashboardRange";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { ORDER_STATUS } from "../../orders/orderStatus";
import { PAYMENT_METHOD } from "../../orders/constants";
import { LOW_STOCK_THRESHOLD } from "../../products/constants";
import type { AdminAnalyticsSummary } from "../types";
import { useAdminDashboardCopy } from "../../../hooks/useAdminDashboardCopy";
import { useLocale } from "../../../context/LocaleContext";

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

const AdminDashboardCharts = React.lazy(() => import("../components/AdminDashboardCharts"));
// Keep the operational queues out of the initial dashboard route bundle while
// preserving their normal loading, error, and retry behavior once mounted.
const AdminDashboardOperations = React.lazy(() => import("../components/AdminDashboardOperations"));

const formatUtcDay = (date: Date, locale = "en-US") =>
    new Intl.DateTimeFormat(locale, {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    }).format(date);

type RawDashboardOrder = Omit<Order, "date_added"> & { date_added: string | Date };

const normalizeOrder = (order: RawDashboardOrder): Order => ({
    ...order,
    id: Number(order.id),
    status: Number(order.status),
    total_price: Number(order.total_price) || 0,
    discount: Number(order.discount) || 0,
    date_added: order.date_added instanceof Date ? order.date_added : new Date(order.date_added),
});

const normalizeUser = (user: AdminAccount): AdminAccount => ({
    ...user,
    created_at: user.created_at instanceof Date ? user.created_at : new Date(user.created_at),
});

const getNetRevenue = (order: Order) => order.status === ORDER_STATUS.CANCELED
    ? 0
    : Math.max(order.total_price - order.discount, 0);

const normalizePaymentMix = (points: Array<{ name?: unknown; value?: unknown }>): ChartDatum[] => {
    const totals = new Map<string, number>();

    points.forEach((point) => {
        const normalizedName = String(point.name || "").toLowerCase();
        const name = normalizedName === PAYMENT_METHOD.CASH
            ? "Cash"
            : normalizedName === PAYMENT_METHOD.PAYOS
              ? "PayOS"
              : normalizedName === "" || normalizedName === "unknown"
                ? "Not recorded"
                : "Historical methods";
        totals.set(name, (totals.get(name) || 0) + (Number(point.value) || 0));
    });

    return Array.from(totals, ([name, value]) => ({ name, value })).filter((item) => item.value > 0);
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

const DashboardChartsFallback = ({ deferred = false }: { deferred?: boolean }) => (
    <section className="admin__dashboard__fallback" aria-busy={!deferred}>
        <div className="admin__card admin__dashboard__fallback__hero">
            <div className="admin__card__header">
                <div className="admin__dashboard__fallback__copy">
                    <span className="admin__dashboard__fallback__eyebrow">
                        {deferred ? "Analytics" : "Loading analytics"}
                    </span>
                    <h3>{deferred ? "Charts load as you reach this section" : "Preparing dashboard visualizations"}</h3>
                    <p>
                        {deferred
                            ? "Visualizations load automatically as this section approaches the viewport."
                            : "Revenue, inventory, and fulfillment charts are loading in the background."}
                    </p>
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
    const chartsContainerRef = useRef<HTMLDivElement>(null);
    const [shouldLoadCharts, setShouldLoadCharts] = useState(false);
    const range = parseDashboardRange(searchParams.get("range"));
    const [products, setProducts] = useState<Product[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [pendingQueue, setPendingQueue] = useState<Order[]>([]);
    const [users, setUsers] = useState<AdminAccount[]>([]);
    const [analyticsSummary, setAnalyticsSummary] = useState<AdminAnalyticsSummary | null>(null);
    const [alerts, setAlerts] = useState<AdminAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [availability, setAvailability] = useState<DashboardAvailability>(initialDashboardAvailability);
    const { addToast } = useToast();
    const tx = useAdminDashboardCopy();
    const { locale } = useLocale();

    useEffect(() => {
        document.title = `${tx("Admin dashboard")} | Digital-E`;
        return () => {
            document.title = tx("Digital-E - Admin");
        };
    }, [tx]);
    const formatReportDate = (date = new Date()) => formatUtcDateTime(date, locale === "vi" ? "vi-VN" : "en-GB");

    useEffect(() => {
        if (shouldLoadCharts) return;

        const chartsContainer = chartsContainerRef.current;
        if (!chartsContainer) return;

        if (typeof IntersectionObserver === "undefined") {
            setShouldLoadCharts(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;
                setShouldLoadCharts(true);
                observer.disconnect();
            },
            { rootMargin: "400px 0px" },
        );

        observer.observe(chartsContainer);
        return () => observer.disconnect();
    }, [loading, shouldLoadCharts]);

    const fetchDashboardData = useCallback(async (showToast = false) => {
        try {
            setLoading(true);

            const [analyticsResult, productResult, orderResult, userResult, pendingResult, alertsResult] = await Promise.allSettled([
                fetchAnalyticsSummary(range),
                fetchAdminProducts(1, 12),
                fetchAdminOrders(1, 20),
                fetchAdminUsers(1, 20),
                fetchAdminPendingOrderQueue(),
                fetchAdminAlerts(),
            ]);
            const analyticsData = (analyticsResult.status === "fulfilled"
                ? analyticsResult.value?.summary && typeof analyticsResult.value.summary === "object"
                    ? analyticsResult.value.summary
                    : analyticsResult.value
                : undefined) as AdminAnalyticsSummary | undefined;

            const results = {
                analytics: analyticsResult,
                products: productResult,
                orders: orderResult,
                users: userResult,
                pendingOrders: pendingResult,
                alerts: alertsResult,
            };
            const loadedSections = Object.values(results).filter((result) => result.status === "fulfilled").length;
            const nextAvailability: DashboardAvailability = {
                analytics: analyticsResult.status === "fulfilled" ? "success" : "error",
                products: productResult.status === "fulfilled" ? "success" : "error",
                orders: orderResult.status === "fulfilled" && pendingResult.status === "fulfilled" ? "success" : "error",
                users: userResult.status === "fulfilled" ? "success" : "error",
                orderItems: Array.isArray(analyticsData?.charts?.topProducts) ? "success" : "error",
                alerts: alertsResult.status === "fulfilled" ? "success" : "error",
            };

            setAvailability(nextAvailability);

            if (analyticsResult.status === "fulfilled") {
                setAnalyticsSummary(analyticsData ?? null);
            }

            if (productResult.status === "fulfilled") {
                setProducts(productResult.value || []);
            }

            if (orderResult.status === "fulfilled") {
                setOrders((orderResult.value || []).map(normalizeOrder));
            }

            if (pendingResult.status === "fulfilled") {
                setPendingQueue(pendingResult.value.map(normalizeOrder));
            }

            if (userResult.status === "fulfilled") {
                setUsers((userResult.value || []).map(normalizeUser));
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

    const refreshDashboardSignals = useCallback(async () => {
        const [pendingResult, alertsResult] = await Promise.allSettled([
            fetchAdminPendingOrderQueue(),
            fetchAdminAlerts(),
        ]);
        setAvailability((current) => ({
            ...current,
            alerts: alertsResult.status === "fulfilled" ? "success" : "error",
            orders: pendingResult.status === "fulfilled" ? "success" : "error",
        }));
        if (pendingResult.status === "fulfilled") setPendingQueue(pendingResult.value.map(normalizeOrder));
        if (alertsResult.status === "fulfilled") setAlerts(alertsResult.value.alerts || []);
    }, []);

    const handleRangeChange = useCallback((nextRange: DashboardRange) => {
        setSearchParams({ range: nextRange }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        fetchDashboardData();

        const refreshTimer = window.setInterval(() => {
            refreshDashboardSignals();
        }, 30000);

        return () => window.clearInterval(refreshTimer);
    }, [fetchDashboardData, refreshDashboardSignals]);

    const analyticsTrend = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.revenueTrend || analyticsSummary?.revenueTrend || [] : []).map((point) => ({
                name: formatUtcDay(new Date(`${point.date}T00:00:00Z`), locale === "vi" ? "vi-VN" : "en-US"),
                revenue: Number(point.netRevenue ?? point.revenue) || 0,
                orders: Number(point.orders) || 0,
            })),
        [analyticsSummary, availability.analytics, locale],
    );
    const monthlyTrends = useMemo<TrendPoint[]>(() => analyticsTrend.map((point) => ({
        name: point.name,
        sales: point.orders,
        revenue: point.revenue,
    })), [analyticsTrend]);
    const topRevenueProducts = useMemo(
        () => (availability.analytics === "success" ? analyticsSummary?.charts?.topProducts || [] : []).map((product) => ({
            name: product.name,
            sales: Number(product.sales) || 0,
            revenue: Number(product.revenue) || 0,
        })),
        [analyticsSummary, availability.analytics],
    );
    const analyticsCategoryRevenue = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.categoryPerformance || analyticsSummary?.categoryRevenue || [] : []).map((point) => ({
                name: point.name,
                value: Number(point.revenue ?? point.value) || 0,
                units: Number(point.units) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const categoryRevenue = useMemo<ChartDatum[]>(() => analyticsCategoryRevenue.map((point) => ({
        name: point.name,
        value: point.value,
        revenue: point.value,
        stock: undefined,
    })), [analyticsCategoryRevenue]);
    const analyticsPaymentMix = useMemo(
        () => normalizePaymentMix(
            availability.analytics === "success" ? analyticsSummary?.charts?.paymentMethods || [] : [],
        ),
        [analyticsSummary, availability.analytics],
    );
    const analyticsStatusMix = useMemo(
        () =>
            (availability.analytics === "success" ? analyticsSummary?.charts?.orderStatusBreakdown || [] : []).map((point) => ({
                name: point.name,
                value: Number(point.value) || 0,
            })),
        [analyticsSummary, availability.analytics],
    );
    const paymentMix = analyticsPaymentMix;
    const statusMix = analyticsStatusMix;
    const hasAnalyticsKpis = availability.analytics === "success" && Boolean(analyticsSummary?.kpis);
    const rangeLabel = getDashboardRangeLabel(range);
    const alertGroups = useMemo(
        () => (availability.alerts === "success" ? groupAdminAlerts(alerts) : []),
        [alerts, availability.alerts],
    );
    const markAlertGroupRead = useCallback((group: (typeof alertGroups)[number]) => {
        void acknowledgeAdminAlerts(group.alertIds)
            .then(() => {
                const alertIds = new Set(group.alertIds);
                setAlerts((current) => current.map((alert) => alertIds.has(alert.id) ? { ...alert, unread: false } : alert));
            })
            .catch((error) => addToast("Admin alerts", getApiErrorMessage(error, "Unable to mark alerts as read.")));
    }, [addToast]);

    const selectedPeriodMetrics = useMemo(() => {
        const revenueComparison = analyticsSummary?.kpis?.revenue?.comparison;
        const orderComparison = analyticsSummary?.kpis?.orders?.comparison;
        const trendRevenue = analyticsTrend.reduce((sum, point) => sum + (point.revenue || 0), 0);
        const trendOrders = analyticsTrend.reduce((sum, point) => sum + (point.orders || 0), 0);
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
        const nonCancelledOrders = orders.filter((order) => order.status !== ORDER_STATUS.CANCELED);
        const pendingOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.pending !== undefined
            ? Number(analyticsSummary.kpis.orders.pending)
            : nonCancelledOrders.filter((order) => order.status === ORDER_STATUS.PENDING).length;
        const completedOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.completed !== undefined
            ? Number(analyticsSummary.kpis.orders.completed)
            : nonCancelledOrders.filter((order) => order.status === ORDER_STATUS.DONE).length;
        const cancelledOrders = availability.analytics === "success" && analyticsSummary?.kpis?.orders?.cancelled !== undefined
            ? Number(analyticsSummary.kpis.orders.cancelled)
            : orders.filter((order) => order.status === ORDER_STATUS.CANCELED).length;
        const cashOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Cash")?.value ?? nonCancelledOrders.filter((order) => order.payment_method === PAYMENT_METHOD.CASH).length;
        const payosOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "PayOS")?.value ?? nonCancelledOrders.filter((order) => order.payment_method === PAYMENT_METHOD.PAYOS).length;
        const historicalPaymentOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Historical methods")?.value
            ?? nonCancelledOrders.filter((order) => Boolean(order.payment_method) && order.payment_method !== PAYMENT_METHOD.CASH && order.payment_method !== PAYMENT_METHOD.PAYOS).length;
        const notRecordedOrders = analyticsPaymentMix.find((item: ChartDatum) => item.name === "Not recorded")?.value
            ?? nonCancelledOrders.filter((order) => !order.payment_method).length;
        const totalRevenue = availability.analytics === "success" && analyticsSummary?.kpis?.revenue?.net !== undefined
            ? Number(analyticsSummary.kpis.revenue.net)
            : orders.reduce((sum, order) => sum + getNetRevenue(order), 0);
        const lowStockProducts = (availability.analytics === "success" ? analyticsSummary?.operations?.inventoryRisk || [] : [])
            .filter((product) => Number(product.stock) <= LOW_STOCK_THRESHOLD)
            .sort((a, b) => Number(a.stock) - Number(b.stock))
            .slice(0, 5);
        const fallbackLowStockProducts = availability.products === "success" ? products
            .filter((product) => product.stock <= LOW_STOCK_THRESHOLD)
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
            cashOrders,
            payosOrders,
            historicalPaymentOrders,
            notRecordedOrders,
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
            description: `${tx(rangeLabel)} · ${tx("after discounts")}`,
            status: availability.analytics,
            delta: { value: selectedPeriodMetrics.revenueDelta },
        },
        {
            label: "Orders",
            value: analyticsSummary?.kpis?.orders?.nonCancelled
                ?? orders.filter((order) => order.status !== ORDER_STATUS.CANCELED).length,
            description: "Non-canceled orders",
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
    ], [analyticsSummary, availability.analytics, availability.orders, availability.products, dashboardStats.lowStockProducts.length, dashboardStats.pendingOrders, orders, rangeLabel, selectedPeriodMetrics, tx]);

    const handleDownloadReport = () => {
        const reportKpisAvailable = availability.analytics === "success";
        const reportActiveProducts = reportKpisAvailable && availability.products === "success"
            ? analyticsSummary?.kpis?.inventory?.totalProducts ?? products.length
            : "Unavailable";
        const reportRegisteredUsers = reportKpisAvailable && availability.users === "success"
            ? analyticsSummary?.kpis?.customers?.total ?? users.length
            : "Unavailable";
        const reportOrdersTracked = reportKpisAvailable && availability.orders === "success"
            ? analyticsSummary?.kpis?.orders?.nonCancelled
                ?? orders.filter((order) => order.status !== ORDER_STATUS.CANCELED).length
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
            `- Cash orders: ${reportPaymentMixAvailable ? dashboardStats.cashOrders : "Unavailable"}`,
            `- PayOS orders: ${reportPaymentMixAvailable ? dashboardStats.payosOrders : "Unavailable"}`,
            `- Historical payment records: ${reportPaymentMixAvailable ? dashboardStats.historicalPaymentOrders : "Unavailable"}`,
            `- Not recorded orders: ${reportPaymentMixAvailable ? dashboardStats.notRecordedOrders : "Unavailable"}`,
            "",
            "TOP REVENUE PRODUCTS",
            ...(reportTopProductsAvailable
                ? topRevenueProducts.length > 0
                    ? topRevenueProducts.slice(0, 5).map((product, index) => {
                      return `${index + 1}. ${product.name} | Sales: ${product.sales} | Revenue: ${formatCurrency(product.revenue)}`;
                    })
                    : ["- No top revenue products found."]
                : ["- Unavailable"]),
            "",
            "LOW STOCK WATCHLIST",
            ...(!reportLowStockAvailable
                ? ["- Unavailable"]
                : dashboardStats.lowStockProducts.length > 0
                  ? dashboardStats.lowStockProducts.map(
                      (product, index) => `${index + 1}. ${product.name} | Remaining stock: ${product.stock}`,
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
                <meta name="description" content={tx("Overview of store performance and key metrics.")} />
            </Helmet>
            <main className="admin__page admin__page--dashboard">
                <AdminDashboardHeader
                    range={range}
                    onRangeChange={handleRangeChange}
                    loading={loading}
                    updateLabel={getDashboardUpdateLabel(availability)}
                    lastUpdated={lastUpdated ? lastUpdated.toLocaleTimeString(locale === "vi" ? "vi-VN" : "en-GB") : null}
                    onRefresh={() => fetchDashboardData(true)}
                    onDownloadReport={handleDownloadReport}
                />
                <AdminDashboardAttention
                    status={availability.alerts}
                    groups={alertGroups}
                    onRetry={() => fetchDashboardData(true)}
                    onOpenAlerts={markAlertGroupRead}
                />
                <AdminDashboardKpiGrid kpis={primaryKpis} />
                <Suspense fallback={<div className="admin__dashboard__operations" role="status" aria-busy="true">{tx("Loading pending orders")}</div>}>
                    <AdminDashboardOperations
                        pendingOrders={pendingQueue}
                        lowStockProducts={dashboardStats.lowStockProducts}
                        ordersStatus={availability.orders}
                        productsStatus={availability.products}
                        formatCurrency={formatCurrency}
                        formatReportDate={formatReportDate}
                        onRetry={() => fetchDashboardData(true)}
                    />
                </Suspense>

                <div ref={chartsContainerRef}>
                    {shouldLoadCharts ? (
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
                    ) : (
                        <DashboardChartsFallback deferred />
                    )}
                </div>
            </main>
        </AdminLayout>
    );
};

export default AdminDashboard;

