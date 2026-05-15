import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import axios from "../../api/axios";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import Layout from "../layout/Layout";
import { formatUtcDateTime } from "../../utils/dateTime";
import "../../styles/CustomerNotificationsPage.scss";

type CustomerNotification = {
    id: number;
    type: string;
    title: string;
    message: string;
    link: string | null;
    read_at: string | null;
    created_at: string;
    is_read: boolean;
};

const CustomerNotificationsPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const [notifications, setNotifications] = useState<CustomerNotification[]>([]);

    const fetchNotifications = async () => {
        if (!uid) return;
        try {
            const response = await axios.get(`/api/users/${uid}/notifications?limit=50`);
            setNotifications(response.data.notifications || []);
        } catch {
            addToast("Notifications", "Unable to load notifications.");
        }
    };

    useEffect(() => {
        fetchNotifications();
    }, [uid]);

    const markAllRead = async () => {
        if (!uid) return;
        try {
            await axios.post(`/api/users/${uid}/notifications/read-all`);
            setNotifications((current) => current.map((item) => ({ ...item, is_read: true, read_at: item.read_at || new Date().toISOString() })));
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
                <header className="customer-notifications__header">
                    <div>
                        <span>Account</span>
                        <h1>Notifications</h1>
                        <p>Order updates, checkout messages, and important account events.</p>
                    </div>
                    <button type="button" onClick={markAllRead}>Mark all read</button>
                </header>

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
