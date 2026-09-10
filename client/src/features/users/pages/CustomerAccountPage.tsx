import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { BellIcon, CartIcon, HouseIcon, PersonIcon } from "../../../components/common/Icons";
import EmptyState from "../../../components/common/EmptyState";
import Layout from "../../../components/layout/Layout";
import { formatUtcDate, formatUtcDateTime } from "../../../utils/dateTime";
import "../../orders/types";
import "../../../styles/features/users/_customer-account.scss";
import CustomerAccountShell from "../components/CustomerAccountShell";
import {
    CustomerAddress,
    CustomerIdentity,
    CustomerNotification,
    fetchCurrentCustomer,
    fetchCustomerAddresses,
    fetchCustomerNotifications,
    markAllCustomerNotificationsRead,
    markCustomerNotificationRead,
} from "../api";
import { CustomerOrder, fetchCustomerOrders } from "../../orders/api";
import {
    requestEmailChange as requestEmailChangeEmail,
    resendVerification as resendVerificationEmail,
} from "../../auth/api";
import { formatCurrency } from "../../../utils/currency";


const getDisplayName = (customer: CustomerIdentity | null) => {
    if (!customer) return "Customer";
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    return fullName || customer.username || "Customer";
};

const getStatusLabel = (status: number) => {
    if (status === 1) return "Done";
    if (status === 0) return "Pending";
    return "Canceled";
};

const CustomerAccountPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const location = useLocation();
    const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(true);
    const [isMarkingAllNotificationsRead, setIsMarkingAllNotificationsRead] = useState(false);
    const [isMarkingNotificationId, setIsMarkingNotificationId] = useState<number | null>(null);
    const [expandedNotificationId, setExpandedNotificationId] = useState<number | null>(null);
    const [isSendingVerification, setIsSendingVerification] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [isRequestingEmailChange, setIsRequestingEmailChange] = useState(false);
    const [emailChangeMessage, setEmailChangeMessage] = useState("");
    const [emailChangeError, setEmailChangeError] = useState(false);

    const resendVerification = async () => {
        if (isSendingVerification) return;
        const email = userData?.email || customer?.email;
        if (!email) return;
        try {
            setIsSendingVerification(true);
            await resendVerificationEmail(email);
            addToast("Verify your email", "If email delivery is configured, a new verification link is on its way.");
        } catch {
            addToast("Verify your email", "Please sign in again before requesting a new verification link.");
        } finally {
            setIsSendingVerification(false);
        }
    };

    const requestEmailChange = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = newEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
            setEmailChangeError(true);
            setEmailChangeMessage("Enter a valid new email address.");
            return;
        }

        try {
            setIsRequestingEmailChange(true);
            setEmailChangeError(false);
            await requestEmailChangeEmail(normalizedEmail);
            setNewEmail("");
            setEmailChangeMessage("Check your new email to confirm the change.");
            addToast("Change email", "A confirmation link has been sent to your new email address.");
        } catch (error: unknown) {
            const response = error && typeof error === "object" && "response" in error
                ? (error as { response?: { data?: { msg?: string } } }).response
                : undefined;
            setEmailChangeError(true);
            setEmailChangeMessage(response?.data?.msg || "Unable to request an email change right now.");
        } finally {
            setIsRequestingEmailChange(false);
        }
    };

    useEffect(() => {
        const loadAccount = async () => {
            if (!uid) return;

            try {
                setLoading(true);
                const [currentCustomer, customerOrders, customerAddresses] = await Promise.all([
                    fetchCurrentCustomer(),
                    fetchCustomerOrders(uid),
                    fetchCustomerAddresses(uid),
                ]);

                setCustomer(currentCustomer);
                setOrders(customerOrders);
                setAddresses(customerAddresses);
            } catch {
                addToast("Account", "Unable to load your account overview.");
            } finally {
                setLoading(false);
            }
        };

        loadAccount();
    }, [addToast, uid]);

    useEffect(() => {
        const loadNotifications = async () => {
            if (!uid) {
                setNotifications([]);
                setIsNotificationsLoading(false);
                return;
            }

            try {
                setIsNotificationsLoading(true);
                const response = await fetchCustomerNotifications(uid, 10);
                setNotifications(response.notifications);
            } catch {
                addToast("Notifications", "Unable to load notification updates.");
            } finally {
                setIsNotificationsLoading(false);
            }
        };

        loadNotifications();
    }, [addToast, uid]);

    useEffect(() => {
        if (loading || location.hash !== "#notifications") return;

        const notificationsSection = document.getElementById("account-notifications");
        if (notificationsSection && typeof notificationsSection.scrollIntoView === "function") {
            notificationsSection.scrollIntoView({ block: "start" });
        }
    }, [loading, location.hash]);

    const unreadNotificationCount = notifications.filter((notification) => !notification.is_read).length;

    const markAllNotificationsRead = async () => {
        if (!uid || isMarkingAllNotificationsRead || isMarkingNotificationId !== null || unreadNotificationCount === 0) {
            return;
        }

        try {
            setIsMarkingAllNotificationsRead(true);
            const result = await markAllCustomerNotificationsRead(uid);
            setNotifications((current) => current.map((notification) => ({
                ...notification,
                is_read: true,
                read_at: notification.read_at || new Date().toISOString(),
            })));
            addToast(
                "Notifications",
                result.updated > 0 ? "All notifications marked as read." : "There were no unread notifications.",
            );
        } catch {
            addToast("Notifications", "Unable to update notifications.");
        } finally {
            setIsMarkingAllNotificationsRead(false);
        }
    };

    const markNotificationRead = async (notification: CustomerNotification) => {
        if (
            !uid
            || notification.is_read
            || isMarkingAllNotificationsRead
            || isMarkingNotificationId !== null
        ) {
            return;
        }

        try {
            setIsMarkingNotificationId(notification.id);
            await markCustomerNotificationRead(uid, notification.id);
            setNotifications((current) => current.map((item) => item.id === notification.id
                ? { ...item, is_read: true, read_at: item.read_at || new Date().toISOString() }
                : item));
            addToast("Notifications", "Notification marked as read.");
        } catch {
            addToast("Notifications", "Unable to update notification.");
        } finally {
            setIsMarkingNotificationId(null);
        }
    };

    const recentOrders = useMemo(() => orders.slice(0, 3), [orders]);
    const primaryAddress = useMemo(
        () => addresses.find((address) => address.is_default) || addresses[0] || null,
        [addresses],
    );
    const emailIsUnverified = userData?.email_verified === false || customer?.email_verified === false;
    return (
        <Layout>
            <Helmet>
                <title>My Account | Digital-E</title>
                <meta name="description" content="Review your account, orders, and saved addresses." />
            </Helmet>
            <main className="customer-account-page">
                <CustomerAccountShell
                    eyebrow="YOUR DIGITAL-E"
                    title="My account"
                    description="A quick view of your purchases, delivery details, and account activity."
                />

                {loading ? (
                    <>
                        <section className="customer-account-page__hero customer-account-page__hero--loading" aria-hidden="true">
                            <div className="customer-account-page__identity">
                                <span className="customer-account-page__skeleton customer-account-page__skeleton--badge" />
                                <span className="customer-account-page__skeleton customer-account-page__skeleton--title" />
                                <span className="customer-account-page__skeleton customer-account-page__skeleton--line" />
                                <span className="customer-account-page__skeleton customer-account-page__skeleton--line customer-account-page__skeleton--line-short" />
                            </div>
                            <div className="customer-account-page__stats">
                                {Array.from({ length: 2 }, (_, index) => (
                                    <article key={`account-stat-loading-${index}`}>
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--stat-label" />
                                        <strong className="customer-account-page__skeleton customer-account-page__skeleton--stat-value" />
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="customer-account-page__actions" aria-hidden="true">
                            {Array.from({ length: 2 }, (_, index) => (
                                <div key={`account-action-loading-${index}`} className="customer-account-page__action-skeleton">
                                    <span className="customer-account-page__skeleton customer-account-page__skeleton--action" />
                                </div>
                            ))}
                        </section>

                        <section className="customer-account-page__grid" aria-hidden="true">
                            {Array.from({ length: 2 }, (_, index) => (
                                <article key={`account-panel-loading-${index}`} className="customer-account-page__panel">
                                    <div className="customer-account-page__panel__header">
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--panel-title" />
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--panel-link" />
                                    </div>
                                    <div className="customer-account-page__panel-loading">
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--line" />
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--line" />
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--line customer-account-page__skeleton--line-short" />
                                    </div>
                                </article>
                            ))}
                        </section>
                    </>
                ) : (
                    <>
                        <section className="customer-account-page__hero">
                            <div className="customer-account-page__identity">
                                <span className="customer-account-page__identity__badge">
                                    <PersonIcon size={16} />
                                    Customer account
                                </span>
                                <h2>{getDisplayName(customer)}</h2>
                                <p>{customer?.email || userData?.email || "No email available"}</p>
                                {emailIsUnverified ? (
                                    <button type="button" onClick={resendVerification} disabled={isSendingVerification}>
                                        {isSendingVerification ? "Sending verification..." : "Resend verification email"}
                                    </button>
                                ) : null}
                                <small>Last active {customer?.last_login ? formatUtcDateTime(customer.last_login) : "recently"}</small>
                                <form className="customer-account-page__email-change" onSubmit={requestEmailChange}>
                                    <label htmlFor="customer-account-new-email">New email</label>
                                    <div className="customer-account-page__email-change__controls">
                                        <input
                                            id="customer-account-new-email"
                                            type="email"
                                            autoComplete="email"
                                            value={newEmail}
                                            onChange={(event) => setNewEmail(event.target.value)}
                                            placeholder="new@example.com"
                                            required
                                        />
                                        <button type="submit" disabled={isRequestingEmailChange}>
                                            {isRequestingEmailChange ? "Sending..." : "Send email-change link"}
                                        </button>
                                    </div>
                                    {emailChangeMessage ? (
                                        <p role={emailChangeError ? "alert" : "status"}>{emailChangeMessage}</p>
                                    ) : null}
                                </form>
                            </div>

                            <div className="customer-account-page__stats">
                                <article>
                                    <span>Orders</span>
                                    <strong>{orders.length}</strong>
                                </article>
                                <article>
                                    <span>Addresses</span>
                                    <strong>{addresses.length}</strong>
                                </article>
                            </div>
                        </section>

                        <section className="customer-account-page__workflow" aria-label="Customer workflow shortcuts">
                            <Link to="/orders">
                                <span>
                                    <CartIcon size={18} />
                                </span>
                                <strong>Review orders</strong>
                                <small>Track purchases and reorder available items.</small>
                            </Link>
                            <Link to="/addresses">
                                <span>
                                    <HouseIcon size={18} />
                                </span>
                                <strong>Manage shipping</strong>
                                <small>Keep delivery addresses ready for checkout.</small>
                            </Link>
                        </section>

                        <section className="customer-account-page__grid">
                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>Recent orders</h3>
                                    <Link to="/orders">View all</Link>
                                </div>
                                <div className="customer-account-page__panel-body">
                                    {recentOrders.length > 0 ? (
                                        <div className="customer-account-page__order-list">
                                            {recentOrders.map((order) => (
                                                <Link key={order.id} to={`/orders?order=${order.id}`}>
                                                    <div>
                                                        <strong>Order #{order.id}</strong>
                                                        <span>{formatUtcDate(order.date_added)}</span>
                                                    </div>
                                                    <div>
                                                        <em>{getStatusLabel(order.status)}</em>
                                                        <small>{formatCurrency(Math.max(order.total_price - order.discount, 0))}</small>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            compact
                                            className="customer-account-page__empty"
                                            title="No orders yet"
                                            description="Your recent orders will appear here after checkout."
                                            actionLabel="Start shopping"
                                            actionTo="/shops"
                                        />
                                    )}
                                </div>
                            </article>

                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>Saved address</h3>
                                    <Link to="/addresses">Manage</Link>
                                </div>
                                <div className="customer-account-page__panel-body">
                                    {primaryAddress ? (
                                        <div className="customer-account-page__address">
                                            <strong>{primaryAddress.label}</strong>
                                            <p>{primaryAddress.address_line}</p>
                                            <span>
                                                {[primaryAddress.city, primaryAddress.country].filter(Boolean).join(", ") ||
                                                    "Location not specified"}
                                            </span>
                                            <small>
                                                {[primaryAddress.recipient_name, primaryAddress.phone_number]
                                                    .filter(Boolean)
                                                    .join(" | ") || "No recipient details"}
                                            </small>
                                        </div>
                                    ) : (
                                        <EmptyState
                                            compact
                                            className="customer-account-page__empty"
                                            title="No saved addresses yet"
                                            description="Add a delivery address to speed up future checkout."
                                            actionLabel="Manage addresses"
                                            actionTo="/addresses"
                                        />
                                    )}
                                </div>
                            </article>

                        </section>

                        <section
                            id="account-notifications"
                            className="customer-account-page__notifications"
                            aria-labelledby="account-notifications-heading"
                            aria-busy={isNotificationsLoading || isMarkingAllNotificationsRead}
                        >
                            <div className="customer-account-page__notifications__header">
                                <div>
                                    <span>ACCOUNT SIGNALS</span>
                                    <h3 id="account-notifications-heading">Notification updates</h3>
                                    <p>
                                        {unreadNotificationCount > 0
                                            ? `${unreadNotificationCount} unread update${unreadNotificationCount === 1 ? "" : "s"} from your account activity.`
                                            : "Order, delivery, and account updates appear here."}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={markAllNotificationsRead}
                                    disabled={
                                        isNotificationsLoading
                                        || unreadNotificationCount === 0
                                        || isMarkingAllNotificationsRead
                                        || isMarkingNotificationId !== null
                                    }
                                >
                                    {isMarkingAllNotificationsRead ? "Updating..." : "Mark all read"}
                                </button>
                            </div>

                            <div className="customer-account-page__notifications__body">
                                {isNotificationsLoading ? (
                                    <div className="customer-account-page__notifications__skeleton" aria-hidden="true">
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                ) : notifications.length > 0 ? (
                                    <div className="customer-account-page__notification-list">
                                        {notifications.map((notification) => (
                                            <article
                                                key={notification.id}
                                                className={notification.is_read ? "" : "is-unread"}
                                            >
                                                <div className="customer-account-page__notification-header">
                                                    <button
                                                        type="button"
                                                        className="customer-account-page__notification-trigger"
                                                        aria-label={notification.title}
                                                        aria-expanded={expandedNotificationId === notification.id}
                                                        aria-controls={expandedNotificationId === notification.id
                                                            ? `account-notification-details-${notification.id}`
                                                            : undefined}
                                                        onClick={() => setExpandedNotificationId((current) =>
                                                            current === notification.id ? null : notification.id,
                                                        )}
                                                    >
                                                        <span className="customer-account-page__notification-meta">
                                                            <span>{notification.type}</span>
                                                            <small>{formatUtcDateTime(notification.created_at)}</small>
                                                        </span>
                                                        <strong>{notification.title}</strong>
                                                        <span className="customer-account-page__notification-toggle">
                                                            {expandedNotificationId === notification.id
                                                                ? "Hide details"
                                                                : "View details"}
                                                        </span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="customer-account-page__notification-mark-read"
                                                        onClick={() => markNotificationRead(notification)}
                                                        disabled={
                                                            notification.is_read
                                                            || isMarkingAllNotificationsRead
                                                            || isMarkingNotificationId !== null
                                                        }
                                                        aria-label={notification.is_read
                                                            ? `${notification.title} is read`
                                                            : `Mark ${notification.title} as read`}
                                                    >
                                                        {isMarkingNotificationId === notification.id
                                                            ? "Saving..."
                                                            : notification.is_read ? "Read" : "Mark read"}
                                                    </button>
                                                </div>
                                                {expandedNotificationId === notification.id ? (
                                                    <div
                                                        id={`account-notification-details-${notification.id}`}
                                                        className="customer-account-page__notification-detail"
                                                    >
                                                        <p>{notification.message}</p>
                                                        {notification.link ? (
                                                            <Link to={notification.link}>Open details</Link>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </article>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        compact
                                        className="customer-account-page__empty"
                                        title="No notifications yet"
                                        description="Order updates, delivery changes, and account reminders will appear here."
                                        actionLabel="Browse products"
                                        actionTo="/shops"
                                        icon={<BellIcon size={18} />}
                                    />
                                )}
                            </div>
                        </section>
                    </>
                )}
            </main>
        </Layout>
    );
};

export default CustomerAccountPage;
