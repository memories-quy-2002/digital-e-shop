import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { BellFillIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon } from "../../../components/common/Icons";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { acknowledgeAdminAlerts, fetchAdminAlerts, updateAdminAlertTriage, type AdminAlert, type AdminAlertTriageAction } from "../api";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { useT } from "../../../hooks/useT";
import { useAdminCopy } from "../../../hooks/useAdminCopy";

type NotificationType = "order" | "inventory" | "payment" | "customer" | "support";
const NOTIFICATION_PAGE_SIZE = 10;

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
    const tx = useAdminCopy();
    const [serverAlerts, setServerAlerts] = useState<AdminAlert[]>([]);
    const [activeType, setActiveType] = useState<"all" | NotificationType>("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const [triageBusyId, setTriageBusyId] = useState<string | null>(null);
    const hasLoadedRef = useRef(false);
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const t = useT();

    useEffect(() => {
        setCurrentPage(1);
    }, [activeType, deferredSearchTerm]);

    const loadNotifications = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const { alerts } = await fetchAdminAlerts();
            setServerAlerts(alerts);
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch (error) {
            setLoadError(getAdminRequestError(error));
            if (hasLoadedRef.current) addToast("Notifications", "Refresh failed. Showing the latest saved notifications.");
        } finally {
            setIsLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        void loadNotifications();
    }, [loadNotifications]);

    const notifications = serverAlerts;

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

    const totalPages = Math.max(1, Math.ceil(filteredNotifications.length / NOTIFICATION_PAGE_SIZE));
    const visiblePage = Math.min(currentPage, totalPages);
    const pageStart = (visiblePage - 1) * NOTIFICATION_PAGE_SIZE;
    const pageNotifications = filteredNotifications.slice(pageStart, pageStart + NOTIFICATION_PAGE_SIZE);
    const firstVisibleAlert = filteredNotifications.length === 0 ? 0 : pageStart + 1;
    const lastVisibleAlert = Math.min(pageStart + NOTIFICATION_PAGE_SIZE, filteredNotifications.length);

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

    const handleMarkRead = async (notification: AdminAlert) => {
        if (!notification.unread) return;
        try {
            await acknowledgeAdminAlerts([notification.id]);
            setServerAlerts((current) => current.map((alert) => alert.id === notification.id ? { ...alert, unread: false } : alert));
            addToast("Notifications", "Notification marked as read.");
        } catch {
            addToast("Notifications", "Unable to mark notification as read.");
        }
    };

    const handleMarkAllRead = async () => {
        const unreadIds = notifications.filter((notification) => notification.unread).map((notification) => notification.id);
        if (unreadIds.length === 0) return;
        try {
            await acknowledgeAdminAlerts(unreadIds);
            const readIds = new Set(unreadIds);
            setServerAlerts((current) => current.map((alert) => readIds.has(alert.id) ? { ...alert, unread: false } : alert));
            addToast("Notifications", `${unreadIds.length} notification${unreadIds.length === 1 ? "" : "s"} marked as read.`);
        } catch {
            addToast("Notifications", "Unable to mark notifications as read.");
        }
    };

    const handleTriage = async (notification: AdminAlert, action: AdminAlertTriageAction) => {
        try {
            setTriageBusyId(notification.id);
            const triage = await updateAdminAlertTriage(notification.id, action);
            setServerAlerts((current) => current.map((alert) => alert.id === notification.id ? { ...alert, ...triage } : alert));
            addToast(t("adminAlertTriage.title"), t("adminAlertTriage.updated"));
        } catch (error) {
            addToast(t("adminAlertTriage.title"), getApiErrorMessage(error, t("adminAlertTriage.updateFailed")));
        } finally {
            setTriageBusyId(null);
        }
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>{tx("Notifications")} | Digital-E</title>
                <meta name="description" content="Review operational notifications for Digital-E." />
            </Helmet>
            <main className="admin__page admin__page--notifications">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">{tx("Operations")}</span>
                        <h1 className="admin__page__title">{tx("Notifications center")}</h1>
                        <p className="admin__page__subtitle">
                            {tx("Review orders, payments, inventory alerts, and customer account signals from one place.")}
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadNotifications}>
                            {tx("Refresh")}
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>{tx("Total alerts")}</span>
                        <strong>{counts.all}</strong>
                        <p>{tx("Active signals")}</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>{tx("Unread alerts")}</span>
                        <strong>{unreadCount}</strong>
                        <p>{tx("Awaiting review")}</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>{tx("Orders & payments")}</span>
                        <strong>{counts.order + counts.payment}</strong>
                        <p>{tx("Customer and payment flow")}</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>{tx("Inventory")}</span>
                        <strong>{counts.inventory}</strong>
                        <p>{tx("Stock needs attention")}</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>{tx("Notification queue")}</h3>
                            <span aria-live="polite">
                                {filteredNotifications.length} {tx("visible alerts")} · {unreadCount} {tx("unread")}
                            </span>
                        </div>
                        <div className="admin__notifications-toolbar">
                            <div className="admin__notifications-toolbar__top">
                                <label className="admin__sr-only" htmlFor="notification-search">{tx("Search notifications")}</label>
                                <input
                                    id="notification-search"
                                    name="notification-search"
                                    type="search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder={tx("Search notifications…")}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={handleMarkAllRead}
                                    disabled={unreadCount === 0 || isLoading}
                                >
                                    {tx("Mark all read")}
                                </button>
                            </div>
                            <div className="admin__notifications-tabs" role="tablist" aria-label={tx("Filter notifications")}>
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
                                        {tx(type === "all" ? "All" : typeMeta[type].label)}
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
                            pageNotifications.map((notification) => (
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
                                                {tx(notification.priority)}
                                            </span>
                                        </div>
                                        <p>{notification.description}</p>
                                        <span>{formatDate(notification.createdAt)}</span>
                                    <span className="admin__notification__triage-status">
                                            {notification.triageStatus === "RESOLVED"
                                                ? t("adminAlertTriage.resolved")
                                                : notification.assignedToMe
                                                  ? t("adminAlertTriage.assignedToYou")
                                                  : notification.assignedAdminId
                                                    ? t("adminAlertTriage.assignedToOther").replace("{adminId}", notification.assignedAdminId)
                                                    : t("adminAlertTriage.open")}
                                        </span>
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
                                        {notification.triageStatus === "RESOLVED" ? (
                                            <button type="button" className="admin__button admin__button--ghost admin__button--compact" disabled={triageBusyId === notification.id} onClick={() => void handleTriage(notification, "reopen")}>
                                                {t("adminAlertTriage.reopen")}
                                            </button>
                                        ) : notification.assignedToMe ? (
                                            <>
                                                <button type="button" className="admin__button admin__button--primary admin__button--compact" disabled={triageBusyId === notification.id} onClick={() => void handleTriage(notification, "resolve")}>
                                                    {t("adminAlertTriage.resolve")}
                                                </button>
                                                <button type="button" className="admin__button admin__button--ghost admin__button--compact" disabled={triageBusyId === notification.id} onClick={() => void handleTriage(notification, "release")}>
                                                    {t("adminAlertTriage.release")}
                                                </button>
                                            </>
                                        ) : notification.assignedAdminId ? (
                                            <button type="button" className="admin__button admin__button--ghost admin__button--compact" disabled>
                                                {t("adminAlertTriage.assignedToOther").replace("{adminId}", notification.assignedAdminId)}
                                            </button>
                                        ) : (
                                            <button type="button" className="admin__button admin__button--ghost admin__button--compact" disabled={triageBusyId === notification.id} onClick={() => void handleTriage(notification, "claim")}>
                                                {t("adminAlertTriage.claim")}
                                            </button>
                                        )}
                                    </div>
                                </article>
                            ))
                        ) : (
                            <div className="admin__notifications-empty">
                                <BellFillIcon size={34} />
                                <strong>{tx("No matching notifications")}</strong>
                                <span>
                                    {notifications.length === 0
                                        ? tx("There are no active operational alerts right now.")
                                        : tx("Try another filter or clear the search to see more activity.")}
                                </span>
                            </div>
                        )}
                        {loadError && hasLoaded ? (
                            <AdminStatusPanel
                                variant="error"
                                title={tx("Refresh failed")}
                                description={loadError.message}
                                onRetry={loadNotifications}
                                retryLabel={tx("Retry refresh")}
                            />
                        ) : null}
                    </div>
                    {filteredNotifications.length > NOTIFICATION_PAGE_SIZE ? (
                        <nav className="admin__notifications-pagination" aria-label={tx("Notification queue pagination")}>
                            <span>
                                {tx("Showing {start}–{end} of {total} alerts")
                                    .replace("{start}", String(firstVisibleAlert))
                                    .replace("{end}", String(lastVisibleAlert))
                                    .replace("{total}", String(filteredNotifications.length))}
                            </span>
                            <div className="admin__notifications-pagination__controls">
                                <span aria-live="polite">
                                    {tx("Page {current} of {total}")
                                        .replace("{current}", String(visiblePage))
                                        .replace("{total}", String(totalPages))}
                                </span>
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost admin__button--compact"
                                    onClick={() => setCurrentPage(Math.max(1, visiblePage - 1))}
                                    disabled={visiblePage <= 1}
                                >
                                    {tx("Previous")}
                                </button>
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost admin__button--compact"
                                    onClick={() => setCurrentPage(Math.min(totalPages, visiblePage + 1))}
                                    disabled={visiblePage >= totalPages}
                                >
                                    {tx("Next")}
                                </button>
                            </div>
                        </nav>
                    ) : null}
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminNotificationsPage;

