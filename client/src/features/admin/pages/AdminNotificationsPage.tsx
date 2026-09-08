import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { BellFillIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon } from "../../../components/common/Icons";
import AdminLayout from "../../../components/layout/AdminLayout";
import { fetchAdminAlerts, type AdminAlert } from "../api";

type NotificationType = "order" | "inventory" | "payment" | "customer" | "support";

const notificationWorkflowSteps = ["Review high-priority alerts", "Resolve the affected workflow", "Clear or defer the signal"];

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
    const [serverAlerts, setServerAlerts] = useState<AdminAlert[]>([]);
    const [activeType, setActiveType] = useState<"all" | NotificationType>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const loadNotifications = async () => {
        try {
            setIsLoading(true);
            const { alerts } = await fetchAdminAlerts();
            setServerAlerts(alerts);
        } catch {
            addToast("Notifications", "Unable to load admin notifications.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
    }, []);

    const notifications = useMemo(() => serverAlerts, [serverAlerts]);

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
            high: notifications.filter((item) => item.priority === "High").length,
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
                        <span>Inventory</span>
                        <strong>{counts.inventory}</strong>
                        <p>Stock needs attention</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Orders</span>
                        <strong>{counts.order + counts.payment}</strong>
                        <p>Customer and payment flow</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Queue health</span>
                        <strong>{counts.high}</strong>
                        <p>{counts.all === 0 ? "Everything is clear" : "Prioritize high-impact issues first"}</p>
                    </div>
                </section>

                <section className="admin__workflow" aria-label="Notifications workflow">
                    {notificationWorkflowSteps.map((step, index) => (
                        <div key={step} className="admin__workflow__step">
                            <span>{index + 1}</span>
                            <strong>{step}</strong>
                        </div>
                    ))}
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
                                {(["all", "order", "inventory", "payment", "customer", "support"] as const).map((type) => (
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
                                <span>
                                    {notifications.length === 0
                                        ? "There are no active operational alerts right now."
                                        : "Try another filter or clear the search to see more activity."}
                                </span>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminNotificationsPage;

