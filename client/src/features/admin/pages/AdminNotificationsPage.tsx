import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { useAuth } from "../../../context/AuthContext";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { BellFillIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon } from "../../../components/common/Icons";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import {
    ADMIN_ALERT_READ_STATE_EVENT,
    applyAdminAlertReadState,
    getAdminAlertReadIds,
    saveAdminAlertReadIds,
} from "../utils/adminAlertState";
import { fetchAdminAlerts, type AdminAlert } from "../api";

type NotificationType = "order" | "inventory" | "payment" | "customer" | "support";

const formatDate = (value: string | Date) => {
    if (value === "Inventory alert") return value;
    return formatUtcDateTime(value);
};

const typeMeta = {
    order: { label: "Orders", icon: <CartIcon size={18} /> },
    inventory: { label: "Inventory", icon: <BoxSeamIcon size={18} /> },
    payment: { label: "Payments", icon: <CashStackIcon size={18} /> },
    customer: { label: "Customers", icon: <PersonIcon size={18} /> },
    support: { label: "Support", icon: <PersonIcon size={18} /> },
};

const AdminNotificationsPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { userData } = useAuth();
    const [serverAlerts, setServerAlerts] = useState<AdminAlert[]>([]);
    const [readAlertIds, setReadAlertIds] = useState<string[]>([]);
    const [activeType, setActiveType] = useState<"all" | NotificationType>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const adminId = userData?.id;

    useEffect(() => {
        setReadAlertIds(getAdminAlertReadIds(adminId));
    }, [adminId]);

    useEffect(() => {
        const handleReadStateChange = () => setReadAlertIds(getAdminAlertReadIds(adminId));
        window.addEventListener(ADMIN_ALERT_READ_STATE_EVENT, handleReadStateChange);
        return () => window.removeEventListener(ADMIN_ALERT_READ_STATE_EVENT, handleReadStateChange);
    }, [adminId]);

    const loadNotifications = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const { alerts } = await fetchAdminAlerts();
            setServerAlerts(alerts);
            setHasLoaded(true);
        } catch (error) {
            setLoadError(getAdminRequestError(error));
            if (hasLoaded) addToast("Notifications", "Refresh failed. Showing the latest saved notifications.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    const notifications = applyAdminAlertReadState(serverAlerts, readAlertIds);

    const filteredNotifications = useMemo(() => {
        const keyword = deferredSearchTerm.trim().toLowerCase();
        return notifications.filter((notification) => {
            const matchesType = activeType === "all" || notification.type === activeType;
            const matchesSearch =
                !keyword ||
                notification.title.toLowerCase().includes(keyword) ||
                notification.description.toLowerCase().includes(keyword);
            return matchesType && matchesSearch;
        });
    }, [activeType, deferredSearchTerm, notifications]);

    const counts = useMemo(
        () => ({
            all: notifications.length,
            order: notifications.filter((item) => item.type === "order").length,
            inventory: notifications.filter((item) => item.type === "inventory").length,
            payment: notifications.filter((item) => item.type === "payment").length,
            customer: notifications.filter((item) => item.type === "customer").length,
            support: notifications.filter((item) => item.type === "support").length,
        }),
        [notifications],
    );

    const unreadCount = notifications.filter((notification) => notification.unread).length;

    const handleMarkRead = (notification: AdminAlert) => {
        if (!notification.unread) return;

        const nextReadAlertIds = [...new Set([...readAlertIds, notification.id])];
        setReadAlertIds(nextReadAlertIds);
        saveAdminAlertReadIds(adminId, nextReadAlertIds);
        addToast("Notifications", "Notification marked as read.");
    };

    const handleMarkAllRead = () => {
        const unreadIds = notifications.filter((notification) => notification.unread).map((notification) => notification.id);
        if (unreadIds.length === 0) return;

        const nextReadAlertIds = [...new Set([...readAlertIds, ...unreadIds])];
        setReadAlertIds(nextReadAlertIds);
        saveAdminAlertReadIds(adminId, nextReadAlertIds);
        addToast("Notifications", `${unreadIds.length} notification${unreadIds.length === 1 ? "" : "s"} marked as read.`);
    };

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
                        <h1 className="admin__page__title">Notifications center</h1>
                        <p className="admin__page__subtitle">
                            Review orders, payments, inventory alerts, and customer account signals from one place.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadNotifications}>
                            Refresh
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
                        <span>Unread alerts</span>
                        <strong>{unreadCount}</strong>
                        <p>Awaiting review</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Orders & payments</span>
                        <strong>{counts.order + counts.payment}</strong>
                        <p>Customer and payment flow</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Inventory</span>
                        <strong>{counts.inventory}</strong>
                        <p>Stock needs attention</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Notification queue</h3>
                            <span aria-live="polite">
                                {filteredNotifications.length} visible alerts · {unreadCount} unread
                            </span>
                        </div>
                        <div className="admin__notifications-toolbar">
                            <div className="admin__notifications-toolbar__top">
                                <label className="admin__sr-only" htmlFor="notification-search">Search notifications</label>
                                <input
                                    id="notification-search"
                                    name="notification-search"
                                    type="search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Search notifications…"
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={handleMarkAllRead}
                                    disabled={unreadCount === 0 || isLoading}
                                >
                                    Mark all read
                                </button>
                            </div>
                            <div className="admin__notifications-tabs" role="tablist" aria-label="Filter notifications">
                                {(["all", "order", "inventory", "payment", "customer", "support"] as const).map((type) => (
                                    <button
                                        key={type}
                                        type="button"
                                        id={`notification-tab-${type}`}
                                        role="tab"
                                        aria-selected={activeType === type}
                                        aria-controls="notification-panel"
                                        tabIndex={activeType === type ? 0 : -1}
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
                    <div
                        id="notification-panel"
                        className="admin__notifications-list"
                        role="tabpanel"
                        aria-labelledby={`notification-tab-${activeType}`}
                        tabIndex={-1}
                    >
                        {loadError && !hasLoaded ? (
                            <AdminStatusPanel
                                variant="error"
                                title={loadError.title}
                                description={loadError.message}
                                onRetry={loadNotifications}
                            />
                        ) : isLoading && !hasLoaded ? (
                            Array.from({ length: 4 }, (_, index) => (
                                <article key={`notification-skeleton-${index}`} className="admin__notification admin__notification--loading" aria-hidden="true">
                                    <div className="admin__notification__icon admin__skeleton" />
                                    <div className="admin__notification__content">
                                        <div className="admin__notification__title-row">
                                            <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--title" />
                                            <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--pill" />
                                        </div>
                                        <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--line" />
                                        <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--line admin__notifications-skeleton--line-short" />
                                        <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--meta" />
                                    </div>
                                    <div className="admin__notification__actions">
                                        <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--button" />
                                        <span className="admin__skeleton admin__notifications-skeleton admin__notifications-skeleton--button" />
                                    </div>
                                </article>
                            ))
                        ) : filteredNotifications.length > 0 ? (
                            filteredNotifications.map((notification) => (
                                <article
                                    key={notification.id}
                                    className={`admin__notification admin__notification--${notification.type}`}
                                >
                                    <div className="admin__notification__icon" aria-hidden="true">
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
                                            className="admin__button admin__button--primary"
                                            onClick={() => navigate(notification.route)}
                                        >
                                            {notification.actionLabel}
                                        </button>
                                        <button
                                            type="button"
                                            className="admin__button admin__button--ghost admin__button--compact"
                                            onClick={() => handleMarkRead(notification)}
                                            disabled={!notification.unread}
                                            aria-label={
                                                notification.unread
                                                    ? `Mark ${notification.title} as read`
                                                    : `${notification.title} is read`
                                            }
                                        >
                                            {notification.unread ? "Mark read" : "Read"}
                                        </button>
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="admin__notifications-empty">
                                <BellFillIcon size={34} />
                                <strong>No matching notifications</strong>
                                <span>
                                    {notifications.length === 0
                                        ? "There are no active operational alerts right now."
                                        : "Try another filter or clear the search to see more activity."}
                                </span>
                            </div>
                        )}
                        {loadError && hasLoaded ? (
                            <AdminStatusPanel
                                variant="error"
                                title="Refresh failed"
                                description={loadError.message}
                                onRetry={loadNotifications}
                                retryLabel="Retry refresh"
                            />
                        ) : null}
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminNotificationsPage;

