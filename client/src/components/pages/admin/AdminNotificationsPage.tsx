import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import axios from "../../../api/axios";
import { useToast } from "../../../context/ToastContext";
import { Product } from "../../../utils/interface";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { BellFillIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon } from "../../common/Icons";
import AdminLayout from "../../layout/AdminLayout";

type NotificationType = "order" | "inventory" | "payment" | "customer";

type Order = {
    id: number;
    date_added: string | Date;
    total_price: number;
    status: number;
    payment_method?: "bank_transfer" | "cash";
    first_name?: string;
    last_name?: string;
    username?: string;
};

type Account = {
    id: string;
    username: string;
    email: string;
    first_name?: string | null;
    last_name?: string | null;
    created_at: string | Date;
    status?: "Active" | "Suspended";
    order_count?: number;
};

type AdminNotification = {
    id: string;
    type: NotificationType;
    title: string;
    description: string;
    createdAt: string | Date;
    priority: "High" | "Medium" | "Low";
    actionLabel: string;
    route: string;
};

const LOW_STOCK_THRESHOLD = 5;

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);

const formatDate = (value: string | Date) => {
    if (value === "Inventory alert") return value;
    return formatUtcDateTime(value);
};

const getCustomerName = (account: Account | Order) => {
    const fullName = [account.first_name, account.last_name].filter(Boolean).join(" ").trim();
    return fullName || account.username || "Customer";
};

const buildNotifications = (orders: Order[], products: Product[], accounts: Account[]): AdminNotification[] => {
    const pendingOrders = orders
        .filter((order) => Number(order.status) === 0)
        .sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())
        .slice(0, 8)
        .map((order) => ({
            id: `order-${order.id}`,
            type: "order" as NotificationType,
            title: `Order #${order.id} needs review`,
            description: `${getCustomerName(order)} placed an order worth ${formatCurrency(order.total_price)}.`,
            createdAt: order.date_added,
            priority: "High" as const,
            actionLabel: "Open orders",
            route: "/admin/orders",
        }));

    const bankTransfers = orders
        .filter((order) => order.payment_method === "bank_transfer" && Number(order.status) === 0)
        .slice(0, 6)
        .map((order) => ({
            id: `payment-${order.id}`,
            type: "payment" as NotificationType,
            title: `Bank transfer pending for order #${order.id}`,
            description: "Confirm the transfer before completing the order.",
            createdAt: order.date_added,
            priority: "Medium" as const,
            actionLabel: "Review payment",
            route: "/admin/orders",
        }));

    const inventoryAlerts = products
        .filter((product) => product.stock <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 10)
        .map((product) => ({
            id: `inventory-${product.id}`,
            type: "inventory" as NotificationType,
            title: product.stock <= 0 ? `${product.name} is out of stock` : `${product.name} is running low`,
            description:
                product.stock <= 0
                    ? "Customers can see the product, but checkout should stay blocked until it is restocked."
                    : `${product.stock} units left. Consider updating inventory soon.`,
            createdAt: "Inventory alert",
            priority: product.stock <= 0 ? ("High" as const) : ("Medium" as const),
            actionLabel: "Manage product",
            route: "/admin/products",
        }));

    const customerAlerts = accounts
        .filter((account) => account.status === "Suspended" || Number(account.order_count || 0) === 0)
        .slice(0, 8)
        .map((account) => ({
            id: `customer-${account.id}`,
            type: "customer" as NotificationType,
            title:
                account.status === "Suspended"
                    ? `${getCustomerName(account)} is suspended`
                    : `${getCustomerName(account)} has not ordered yet`,
            description:
                account.status === "Suspended"
                    ? "Review the account if the customer contacts support."
                    : "New account created without any orders. Useful for conversion follow-up.",
            createdAt: account.created_at,
            priority: account.status === "Suspended" ? ("Medium" as const) : ("Low" as const),
            actionLabel: "Open accounts",
            route: "/admin/accounts",
        }));

    return [...pendingOrders, ...bankTransfers, ...inventoryAlerts, ...customerAlerts].sort((a, b) => {
        const score = { High: 3, Medium: 2, Low: 1 };
        const scoreDiff = score[b.priority] - score[a.priority];
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
};

const typeMeta = {
    order: { label: "Orders", icon: <CartIcon size={18} /> },
    inventory: { label: "Inventory", icon: <BoxSeamIcon size={18} /> },
    payment: { label: "Payments", icon: <CashStackIcon size={18} /> },
    customer: { label: "Customers", icon: <PersonIcon size={18} /> },
};

const AdminNotificationsPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [activeType, setActiveType] = useState<"all" | NotificationType>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchNotifications = async () => {
        try {
            setIsLoading(true);
            const [orderResponse, productResponse, accountResponse] = await Promise.all([
                axios.get("/api/orders"),
                axios.get("/api/products"),
                axios.get("/api/users"),
            ]);
            setOrders(orderResponse.data?.orders || []);
            setProducts(productResponse.data?.products || []);
            setAccounts(accountResponse.data?.accounts || []);
        } catch {
            addToast("Notifications", "Unable to load admin notifications.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, []);

    const notifications = useMemo(
        () => buildNotifications(orders, products, accounts).filter((notification) => !dismissedIds.includes(notification.id)),
        [accounts, dismissedIds, orders, products],
    );

    const filteredNotifications = useMemo(() => {
        const keyword = searchTerm.trim().toLowerCase();
        return notifications.filter((notification) => {
            const matchesType = activeType === "all" || notification.type === activeType;
            const matchesSearch =
                !keyword ||
                notification.title.toLowerCase().includes(keyword) ||
                notification.description.toLowerCase().includes(keyword);
            return matchesType && matchesSearch;
        });
    }, [activeType, notifications, searchTerm]);

    const counts = useMemo(
        () => ({
            all: notifications.length,
            order: notifications.filter((item) => item.type === "order").length,
            inventory: notifications.filter((item) => item.type === "inventory").length,
            payment: notifications.filter((item) => item.type === "payment").length,
            customer: notifications.filter((item) => item.type === "customer").length,
        }),
        [notifications],
    );

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Notifications | Digital-E</title>
                <meta name="description" content="Review operational notifications for Digital-E." />
            </Helmet>
            <main className="admin__page admin__page--notifications">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Operations</span>
                        <h2 className="admin__page__title">Notifications center</h2>
                        <p className="admin__page__subtitle">
                            Review orders, payments, inventory alerts, and customer account signals from one place.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={fetchNotifications}>
                            Refresh
                        </button>
                        <button
                            type="button"
                            className="admin__button admin__button--primary"
                            onClick={() => setDismissedIds(notifications.map((item) => item.id))}
                            disabled={notifications.length === 0}
                        >
                            Clear all
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total alerts</span>
                        <strong>{counts.all}</strong>
                        <p>Active signals</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Inventory</span>
                        <strong>{counts.inventory}</strong>
                        <p>Stock needs attention</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Orders</span>
                        <strong>{counts.order + counts.payment}</strong>
                        <p>Customer and payment flow</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Notification queue</h3>
                            <span>{filteredNotifications.length} visible alerts</span>
                        </div>
                        <div className="admin__notifications-toolbar">
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search notifications"
                            />
                            <div className="admin__notifications-tabs" role="tablist" aria-label="Filter notifications">
                                {(["all", "order", "inventory", "payment", "customer"] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        className={activeType === type ? "active" : ""}
                                        onClick={() => setActiveType(type)}
                                    >
                                        {type === "all" ? "All" : typeMeta[type].label}
                                        <span>{counts[type]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="admin__notifications-list">
                        {isLoading ? (
                            <div className="admin__notifications-empty">Loading notifications...</div>
                        ) : filteredNotifications.length > 0 ? (
                            filteredNotifications.map((notification) => (
                                <article
                                    key={notification.id}
                                    className={`admin__notification admin__notification--${notification.type}`}
                                >
                                    <div className="admin__notification__icon">
                                        {typeMeta[notification.type].icon}
                                    </div>
                                    <div className="admin__notification__content">
                                        <div className="admin__notification__title-row">
                                            <strong>{notification.title}</strong>
                                            <span className={`admin__pill admin__pill--${notification.priority.toLowerCase()}`}>
                                                {notification.priority}
                                            </span>
                                        </div>
                                        <p>{notification.description}</p>
                                        <span>{formatDate(notification.createdAt)}</span>
                                    </div>
                                    <div className="admin__notification__actions">
                                        <button
                                            type="button"
                                            className="admin__button admin__button--ghost"
                                            onClick={() => setDismissedIds((ids) => [...ids, notification.id])}
                                        >
                                            Dismiss
                                        </button>
                                        <button
                                            type="button"
                                            className="admin__button admin__button--primary"
                                            onClick={() => navigate(notification.route)}
                                        >
                                            {notification.actionLabel}
                                        </button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="admin__notifications-empty">
                                <BellFillIcon size={34} />
                                <strong>No matching notifications</strong>
                                <span>The store is quiet for this filter.</span>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminNotificationsPage;
