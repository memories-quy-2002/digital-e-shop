import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import Layout from "../../../components/layout/Layout";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import "../../../styles/CustomerNotificationsPage.scss";
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
                    <div>
                        <strong>{unreadCount}</strong>
                        <span>Unread</span>
                    </div>
                    <p>
                        {unreadCount > 0
                            ? "Unread messages are highlighted first so important order updates are easier to scan."
                            : "All notifications are currently read."}
                    </p>
                </section>

                <section className="customer-notifications__list">
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
                        <div className="customer-notifications__empty">No notifications yet.</div>
                    )}
                </section>
            </main>
        </Layout>
    );
};

export default CustomerNotificationsPage;
