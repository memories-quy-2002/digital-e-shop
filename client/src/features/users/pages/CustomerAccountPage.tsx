import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { BellIcon, CartIcon, HouseIcon, PersonIcon } from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import { formatUtcDate, formatUtcDateTime } from "../../../utils/dateTime";
import "../../orders/types";
import "../../../styles/CustomerAccountPage.scss";
import CustomerAccountShell from "../components/CustomerAccountShell";
import {
    CustomerAddress,
    CustomerIdentity,
    CustomerNotification,
    fetchCurrentCustomer,
    fetchCustomerAddresses,
    fetchCustomerNotifications,
} from "../api";
import { CustomerOrder, fetchCustomerOrders } from "../../orders/api";

const formatCurrency = (value: number) => `$${Number(value || 0).toFixed(2)}`;

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
    const [customer, setCustomer] = useState<CustomerIdentity | null>(null);
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
    const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadAccount = async () => {
            if (!uid) return;

            try {
                setLoading(true);
                const [currentCustomer, customerOrders, customerAddresses, customerNotifications] = await Promise.all([
                    fetchCurrentCustomer(),
                    fetchCustomerOrders(uid),
                    fetchCustomerAddresses(uid),
                    fetchCustomerNotifications(uid, 6),
                ]);

                setCustomer(currentCustomer);
                setOrders(customerOrders);
                setAddresses(customerAddresses);
                setNotifications(customerNotifications.notifications);
                setUnreadNotifications(customerNotifications.unread);
            } catch {
                addToast("Account", "Unable to load your account overview.");
            } finally {
                setLoading(false);
            }
        };

        loadAccount();
    }, [addToast, uid]);

    const recentOrders = useMemo(() => orders.slice(0, 3), [orders]);
    const primaryAddress = useMemo(
        () => addresses.find((address) => address.is_default) || addresses[0] || null,
        [addresses],
    );
    const recentNotifications = useMemo(() => notifications.slice(0, 3), [notifications]);

    return (
        <Layout>
            <Helmet>
                <title>My Account | Digital-E</title>
                <meta name="description" content="Review your account, orders, saved addresses, and notifications." />
            </Helmet>
            <main className="customer-account-page">
                <CustomerAccountShell
                    eyebrow="Account"
                    title="My account"
                    description="Review your recent orders, saved addresses, and account activity from one place."
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
                                {Array.from({ length: 3 }, (_, index) => (
                                    <article key={`account-stat-loading-${index}`}>
                                        <span className="customer-account-page__skeleton customer-account-page__skeleton--stat-label" />
                                        <strong className="customer-account-page__skeleton customer-account-page__skeleton--stat-value" />
                                    </article>
                                ))}
                            </div>
                        </section>

                        <section className="customer-account-page__actions" aria-hidden="true">
                            {Array.from({ length: 3 }, (_, index) => (
                                <div key={`account-action-loading-${index}`} className="customer-account-page__action-skeleton">
                                    <span className="customer-account-page__skeleton customer-account-page__skeleton--action" />
                                </div>
                            ))}
                        </section>

                        <section className="customer-account-page__grid" aria-hidden="true">
                            {Array.from({ length: 3 }, (_, index) => (
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
                                <small>Last active {customer?.last_login ? formatUtcDateTime(customer.last_login) : "recently"}</small>
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
                                <article>
                                    <span>Unread alerts</span>
                                    <strong>{unreadNotifications}</strong>
                                </article>
                            </div>
                        </section>

                        <section className="customer-account-page__actions">
                            <Link to="/orders">
                                <CartIcon size={18} />
                                Order history
                            </Link>
                            <Link to="/addresses">
                                <HouseIcon size={18} />
                                Address book
                            </Link>
                            <Link to="/notifications">
                                <BellIcon size={18} />
                                Notifications
                            </Link>
                        </section>

                        <section className="customer-account-page__grid">
                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>Recent orders</h3>
                                    <Link to="/orders">View all</Link>
                                </div>
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
                                    <p className="customer-account-page__empty">No orders yet.</p>
                                )}
                            </article>

                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>Saved address</h3>
                                    <Link to="/addresses">Manage</Link>
                                </div>
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
                                    <p className="customer-account-page__empty">No saved addresses yet.</p>
                                )}
                            </article>

                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>Recent notifications</h3>
                                    <Link to="/notifications">Open</Link>
                                </div>
                                {recentNotifications.length > 0 ? (
                                    <div className="customer-account-page__notification-list">
                                        {recentNotifications.map((notification) => (
                                            <Link
                                                key={notification.id}
                                                to={notification.link || "/notifications"}
                                                className={notification.is_read ? "" : "is-unread"}
                                            >
                                                <strong>{notification.title}</strong>
                                                <span>{formatUtcDateTime(notification.created_at)}</span>
                                                <p>{notification.message}</p>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="customer-account-page__empty">No notifications yet.</p>
                                )}
                            </article>
                        </section>
                    </>
                )}
            </main>
        </Layout>
    );
};

export default CustomerAccountPage;
