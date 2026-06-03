import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
    ArrowDownIcon,
    ArrowUpIcon,
    BoxSeamIcon,
    CartIcon,
    CashStackIcon,
    PersonIcon,
} from "../../../components/common/Icons";
import axios from "../../../api/axios";
import { Product, Role } from "../../../utils/interface";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminLayout from "../../../components/layout/AdminLayout";
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
    generatedAt?: string;
    currency?: string;
    windows?: {
        trendDays?: number;
        comparisonDays?: number;
    };
    kpis?: {
        orders?: {
            total?: number;
            completed?: number;
            pending?: number;
            cancelled?: number;
            nonCancelled?: number;
            completionRate?: number;
            comparison?: {
                current?: number;
                previous?: number;
                deltaPercent?: number;
            };
        };
        revenue?: {
            gross?: number;
            net?: number;
            discounts?: number;
            averageOrderValue?: number;
            comparison?: {
                current?: number;
                previous?: number;
                deltaPercent?: number;
            };
        };
        customers?: {
            total?: number;
            active?: number;
            inactive?: number;
            activeRate?: number;
        };
        inventory?: {
            totalProducts?: number;
            outOfStock?: number;
            lowStock?: number;
            lowStockThreshold?: number;
        };
    };
    charts?: {
        revenueTrend?: Array<{
            date: string;
            orders: number;
            completedOrders: number;
            grossRevenue: number;
            netRevenue: number;
            discounts: number;
        }>;
        orderStatusBreakdown?: ChartDatum[];
        categoryPerformance?: Array<{ name: string; revenue: number; units: number; orders: number; share: number }>;
        customerSegments?: ChartDatum[];
        paymentMethods?: Array<{ name: string; value: number; revenue: number }>;
    };
    operations?: {
        inventoryRisk?: Array<{ id: number; name: string; stock: number; category: string; brand: string }>;
        promotions?: {
            discountedOrders?: number;
            totalDiscountGiven?: number;
            discountedRevenue?: number;
            attachedCodesTracked?: boolean;
            configured?: Array<{
                id: number;
                code: string;
                discountPercent: number;
                active: boolean;
                startsAt: string | null;
                expiresAt: string | null;
                usageLimit: number | null;
            }>;
        };
    };
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

const AdminDashboardCharts = React.lazy(() => import("../components/AdminDashboardCharts"));

const normalizeAnalyticsSummary = (payload: any): AnalyticsSummary | null => {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const raw = payload.summary && typeof payload.summary === "object" ? payload.summary : payload;
    return raw as AnalyticsSummary;
};

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

            const [analyticsResponse, productResponse, orderResponse, userResponse, orderItemResponse] = await Promise.allSettled([
                axios.get("/api/analytics/summary"),
                axios.get("/api/products?page=1&limit=60"),
                axios.get("/api/orders?page=1&limit=80"),
                axios.get("/api/users?page=1&limit=80"),
                axios.get("/api/orders/item?page=1&limit=120"),
            ]);

            let loadedSections = 0;
            let analyticsLoaded = false;

            if (analyticsResponse.status === "fulfilled") {
                const nextAnalyticsSummary = normalizeAnalyticsSummary(analyticsResponse.value.data);
                setAnalyticsSummary(nextAnalyticsSummary);
                analyticsLoaded = !!nextAnalyticsSummary;
                loadedSections += nextAnalyticsSummary ? 1 : 0;
            } else {
                setAnalyticsSummary(null);
            }

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
            if (!analyticsLoaded && showToast) {
                addToast("Dashboard analytics", "Core dashboard loaded, but analytics summary is unavailable.");
            }

            if (showToast) {
                addToast(
                    "Dashboard refresh",
                    loadedSections >= 4 ? "Dashboard data refreshed." : "Dashboard loaded with partial data.",
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
            (analyticsSummary?.charts?.revenueTrend || analyticsSummary?.revenueTrend || []).map((point: any) => ({
                name: formatUtcDay(new Date(`${point.date}T00:00:00Z`)),
                revenue: Number(point.netRevenue ?? point.revenue) || 0,
                orders: Number(point.orders) || 0,
            })),
        [analyticsSummary],
    );
    const analyticsCategoryRevenue = useMemo(
        () =>
            (analyticsSummary?.charts?.categoryPerformance || analyticsSummary?.categoryRevenue || []).map((point: any) => ({
                name: point.name,
                value: Number(point.revenue ?? point.value) || 0,
                units: Number(point.units) || 0,
            })),
        [analyticsSummary],
    );
    const analyticsPaymentMix = useMemo(
        () =>
            (analyticsSummary?.charts?.paymentMethods || []).map((point: any) => ({
                name: point.name === "bank_transfer" ? "Bank transfer" : point.name === "cash" ? "Cash" : "Unknown",
                value: Number(point.value) || 0,
            })),
        [analyticsSummary],
    );
    const analyticsStatusMix = useMemo(
        () =>
            (analyticsSummary?.charts?.orderStatusBreakdown || []).map((point: any) => ({
                name: point.name,
                value: Number(point.value) || 0,
            })),
        [analyticsSummary],
    );
    const analyticsInventoryRisk = useMemo(
        () =>
            (analyticsSummary?.operations?.inventoryRisk || analyticsSummary?.inventoryRisk || []).map((point: any) => ({
                name: point.name,
                value: Number(point.stock) || 0,
                stock: Number(point.stock) || 0,
            })),
        [analyticsSummary],
    );

    const thisMonth = monthlyTrends[5] || { name: "", sales: 0, revenue: 0 };
    const previousMonth = monthlyTrends[4] || { name: "", sales: 0, revenue: 0 };
    const hasAnalyticsKpis = Boolean(analyticsSummary?.kpis);

    const salesPercentageChange = useMemo(
        () => calculatePercentageChange(thisMonth.sales, previousMonth.sales),
        [thisMonth.sales, previousMonth.sales],
    );
    const revenuePercentageChange = useMemo(
        () => calculatePercentageChange(thisMonth.revenue, previousMonth.revenue),
        [thisMonth.revenue, previousMonth.revenue],
    );

    const dashboardStats = useMemo(() => {
        const pendingOrders = Number(analyticsSummary?.kpis?.orders?.pending) || orders.filter((order) => order.status === 0).length;
        const completedOrders = Number(analyticsSummary?.kpis?.orders?.completed) || orders.filter((order) => order.status === 1).length;
        const cancelledOrders = Number(analyticsSummary?.kpis?.orders?.cancelled) || orders.filter((order) => order.status === 2).length;
        const bankTransferOrders = analyticsPaymentMix.find((item) => item.name === "Bank transfer")?.value || orders.filter((order) => order.payment_method === "bank_transfer").length;
        const cashOrders = analyticsPaymentMix.find((item) => item.name === "Cash")?.value || orders.filter((order) => order.payment_method === "cash").length;
        const totalRevenue = Number(analyticsSummary?.kpis?.revenue?.net) || orders.reduce((sum, order) => sum + getNetRevenue(order), 0);
        const lowStockProducts = (analyticsSummary?.operations?.inventoryRisk || [])
            .filter((product: any) => Number(product.stock) <= 5)
            .sort((a: any, b: any) => Number(a.stock) - Number(b.stock))
            .slice(0, 5);
        const fallbackLowStockProducts = products
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
            lowStockProducts: lowStockProducts.length > 0 ? lowStockProducts : fallbackLowStockProducts,
            latestOrders,
            latestUsers,
        };
    }, [analyticsPaymentMix, analyticsSummary, orders, products, users]);

    const handleDownloadReport = () => {
        const text = [
            "DIGITAL-E OPERATIONS REPORT",
            `Generated at: ${formatReportDate()}`,
            "",
            "OVERVIEW",
            `- Orders tracked: ${orders.length}`,
            `- Active products: ${analyticsSummary?.kpis?.inventory?.totalProducts ?? products.length}`,
            `- Registered users: ${analyticsSummary?.kpis?.customers?.total ?? users.length}`,
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
                    </div>
                </section>

                <section className="admin__dashboard__summary">
                    <div className="admin__dashboard__summary-card">
                        <span>Sales</span>
                        <strong>{thisMonth.sales}</strong>
                        <p>{thisMonth.name || "Current month"}</p>
                    </div>
                    <div className="admin__dashboard__summary-card">
                        <span>Revenue</span>
                        <strong>{formatCurrency(thisMonth.revenue)}</strong>
                        <p>Net after discounts</p>
                    </div>
                    <div className="admin__dashboard__summary-card">
                        <span>Products</span>
                        <strong>{analyticsSummary?.kpis?.inventory?.totalProducts ?? products.length}</strong>
                        <p>Active listings</p>
                    </div>
                    <div className="admin__dashboard__summary-card">
                        <span>Users</span>
                        <strong>{analyticsSummary?.kpis?.customers?.total ?? users.length}</strong>
                        <p>Registered accounts</p>
                    </div>
                    <div className="admin__dashboard__summary-card">
                        <span>Orders</span>
                        <strong>{analyticsSummary?.kpis?.orders?.total ?? orders.length}</strong>
                        <p>{hasAnalyticsKpis ? "All recorded orders" : "Loaded orders snapshot"}</p>
                    </div>
                    <div className="admin__dashboard__summary-card">
                        <span>Top product</span>
                        <strong>{topRevenueProducts[0]?.name || "N/A"}</strong>
                        <p>{hasAnalyticsKpis ? "Highest revenue earner" : "Top item from loaded sales rows"}</p>
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
                        value={analyticsSummary?.kpis?.inventory?.totalProducts ?? products.length}
                        description="Live items in catalog"
                        accent="green"
                        icon={<BoxSeamIcon />}
                    />
                    <Card
                        title="Users"
                        value={analyticsSummary?.kpis?.customers?.total ?? users.length}
                        description="Registered customer accounts"
                        accent="teal"
                        icon={<PersonIcon />}
                    />
                </section>

                <Suspense fallback={<DashboardChartsFallback />}>
                    <AdminDashboardCharts
                        analyticsSummary={analyticsSummary}
                        analyticsTrend={analyticsTrend}
                        dailyActivity={dailyActivity}
                        analyticsPaymentMix={analyticsPaymentMix}
                        paymentMix={paymentMix}
                        analyticsStatusMix={analyticsStatusMix}
                        statusMix={statusMix}
                        dashboardStats={dashboardStats}
                        loading={loading}
                        monthlyTrends={monthlyTrends}
                        analyticsCategoryRevenue={analyticsCategoryRevenue}
                        categoryRevenue={categoryRevenue}
                        analyticsInventoryRisk={analyticsInventoryRisk}
                        stockRisk={stockRisk}
                        topRevenueProducts={topRevenueProducts}
                        hasAnalyticsKpis={hasAnalyticsKpis}
                        formatCurrency={formatCurrency}
                        formatReportDate={formatReportDate}
                        getOrderStatusLabel={getOrderStatusLabel}
                    />
                </Suspense>
            </main>
        </AdminLayout>
    );
};

export default AdminDashboard;

