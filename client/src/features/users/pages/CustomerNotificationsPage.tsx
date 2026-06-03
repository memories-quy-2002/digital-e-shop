import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { BellIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import "../../../styles/features/users/_customer-notifications.scss";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { CustomerNotification, fetchCustomerNotifications, markAllCustomerNotificationsRead } from "../api";
import CustomerAccountShell from "../components/CustomerAccountShell";

const CustomerNotificationsPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
    const unreadCount = notifications.filter((notification) => !notification.is_read).length;

    const loadNotifications = async () => {
        if (!uid) return;
        try {
            const response = await fetchCustomerNotifications(uid, 50);
            setNotifications(response.notifications);
        } catch {
            addToast("Notifications", "Unable to load notifications.");
        }
    };

    useEffect(() => {
        loadNotifications();
    }, [uid]);

    const markAllRead = async () => {
        if (!uid) return;
        try {
            await markAllCustomerNotificationsRead(uid);
            setNotifications((current) =>
                current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })),
            );
        } catch {
            addToast("Notifications", "Unable to update notifications.");
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>Notifications | Digital-E</title>
                <meta name="description" content="Review customer account and order notifications." />
            </Helmet>
            <main className="customer-notifications">
                <CustomerAccountShell
                    eyebrow="Account"
                    title="Notifications"
                    description="Order updates, checkout messages, and important account events."
                    actions={
                        <button type="button" onClick={markAllRead} disabled={unreadCount === 0}>
                            Mark all read
                        </button>
                    }
                />

                <section className="customer-notifications__summary" aria-label="Notification summary">
                    <article>
                        <strong>{notifications.length}</strong>
                        <span>Total notifications</span>
                    </article>
                    <article>
                        <strong>{unreadCount}</strong>
                        <span>Unread messages</span>
                    </article>
                    <article>
                        <strong>{notifications.length > 0 ? formatUtcDateTime(notifications[0].created_at) : "No activity"}</strong>
                        <span>Latest update</span>
                    </article>
                </section>

                <section className="customer-notifications__workflow" aria-label="Notification guidance">
                    <div>
                        <strong>Order tracking first</strong>
                        <p>Unread items stay highlighted so shipping and status changes are easier to scan.</p>
                    </div>
                    <div>
                        <strong>Account reminders</strong>
                        <p>Checkout, profile, and saved-address updates stay in one place with your order activity.</p>
                    </div>
                </section>

                <section className="customer-notifications__list-shell">
                    <div className="customer-notifications__list-header">
                        <div>
                            <h2>Notification history</h2>
                            <p>
                                {unreadCount > 0
                                    ? "Unread messages are highlighted first so important order updates are easier to scan."
                                    : "All notifications are currently read."}
                            </p>
                        </div>
                        <span>{notifications.length} item(s)</span>
                    </div>

                    <div className="customer-notifications__list">
                    {notifications.length > 0 ? (
                        notifications.map((notification) => (
                            <article key={notification.id} className={notification.is_read ? "" : "is-unread"}>
                                <div>
                                    <span>{notification.type}</span>
                                    <small>{formatUtcDateTime(notification.created_at)}</small>
                                </div>
                                <strong>{notification.title}</strong>
                                <p>{notification.message}</p>
                                {notification.link ? <Link to={notification.link}>Open details</Link> : null}
                            </article>
                        ))
                    ) : (
                        <EmptyState
                            className="customer-notifications__empty"
                            title="No notifications yet"
                            description="Order updates, delivery changes, and account reminders will show up here as your activity grows."
                            actionLabel="Browse products"
                            actionTo="/shops"
                            icon={<BellIcon size={20} />}
                        />
                    )}
                    </div>
                </section>
            </main>
        </Layout>
    );
};

export default CustomerNotificationsPage;
