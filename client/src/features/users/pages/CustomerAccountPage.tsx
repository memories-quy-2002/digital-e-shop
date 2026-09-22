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
    sendFirebaseEmailChangeVerification,
    sendFirebaseEmailVerification,
} from "../../../services/firebase";
import { getFirebaseAuthErrorMessage } from "../../auth/authErrors";
import { formatCurrency } from "../../../utils/currency";
import { getOrderStatusKey } from "../../orders/orderStatus";
import { useT, type Translator } from "../../../hooks/useT";
import { CUSTOMER_ROUTES, customerOrderRoute } from "../../../routes/customerRoutes";


const getDisplayName = (customer: CustomerIdentity | null, fallback: string) => {
    if (!customer) return fallback;
    const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
    return fullName || customer.username || fallback;
};

const getStatusLabel = (status: number, t: Translator) => {
    const labels = { pending: t("orders.statusPending"), done: t("orders.statusDone"), canceled: t("orders.statusCanceled"), unknown: t("orders.statusUnknown") };
    return labels[getOrderStatusKey(status)];
};

const getNotificationCopy = (notification: CustomerNotification, t: Translator) => {
    const metadata = notification.metadata && typeof notification.metadata === "object" && !Array.isArray(notification.metadata)
        ? notification.metadata
        : {};
    const productName = typeof metadata.productName === "string" ? metadata.productName.trim() : "";
    const currentPriceValue = Number(metadata.currentPrice);

    if (notification.type === "order") {
        const placedMatch = notification.title.match(/^Order #(\d+) was placed$/);
        const completedMatch = notification.title.match(/^Order #(\d+) is completed$/);
        const canceledMatch = notification.title.match(/^Order #(\d+) is canceled$/);
        const totalMatch = notification.message.match(/^Your order total is (.+?)\./);
        const orderId = placedMatch?.[1] || completedMatch?.[1] || canceledMatch?.[1];
        if (placedMatch && orderId) {
            return {
                typeLabel: t("account.notifications.orderType"),
                title: t("account.notifications.orderPlacedTitle", orderId),
                message: totalMatch ? t("account.notifications.orderPlacedMessage", totalMatch[1]) : notification.message,
            };
        }
        if (completedMatch && orderId) {
            return {
                typeLabel: t("account.notifications.orderType"),
                title: t("account.notifications.orderCompletedTitle", orderId),
                message: t("account.notifications.orderCompletedMessage"),
            };
        }
        if (canceledMatch && orderId) {
            return {
                typeLabel: t("account.notifications.orderType"),
                title: t("account.notifications.orderCanceledTitle", orderId),
                message: t("account.notifications.orderCanceledMessage"),
            };
        }
    }

    if (!productName) {
        return {
            typeLabel: notification.type,
            title: notification.title,
            message: notification.message,
        };
    }

    if (
        (notification.type === "price_drop" || notification.type === "wishlist_price_drop")
        && productName
        && Number.isFinite(currentPriceValue)
        && currentPriceValue > 0
    ) {
        const currentPrice = formatCurrency(currentPriceValue);
        return {
            typeLabel: t("wishlistAlerts.priceDropType"),
            title: t("wishlistAlerts.priceDropNotificationTitle", productName),
            message: t("wishlistAlerts.priceDropNotificationMessage", productName, currentPrice),
        };
    }

    if (
        (notification.type === "back_in_stock" || notification.type === "wishlist_back_in_stock")
        && productName
    ) {
        return {
            typeLabel: t("wishlistAlerts.backInStockType"),
            title: t("wishlistAlerts.backInStockNotificationTitle", productName),
            message: t("wishlistAlerts.backInStockNotificationMessage", productName),
        };
    }

    return {
        typeLabel: notification.type,
        title: notification.title,
        message: notification.message,
    };
};

const CustomerAccountPage = () => {
    const { userData } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();
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
        try {
            setIsSendingVerification(true);
            await sendFirebaseEmailVerification();
            addToast(t("account.verifyEmailToast"), t("account.verificationSent"));
        } catch {
            addToast(t("account.verifyEmailToast"), t("account.verificationSignIn"));
        } finally {
            setIsSendingVerification(false);
        }
    };

    const requestEmailChange = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = newEmail.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
            setEmailChangeError(true);
            setEmailChangeMessage(t("account.validEmail"));
            return;
        }

        try {
            setIsRequestingEmailChange(true);
            setEmailChangeError(false);
            await sendFirebaseEmailChangeVerification(normalizedEmail);
            setNewEmail("");
            setEmailChangeMessage(t("account.emailChangeCheck"));
            addToast(t("account.changeEmail"), t("account.emailChangeSent"));
        } catch (error: unknown) {
            const response = error && typeof error === "object" && "response" in error
                ? (error as { response?: { data?: { msg?: string } } }).response
                : undefined;
            setEmailChangeError(true);
            setEmailChangeMessage(response?.data?.msg || getFirebaseAuthErrorMessage(
                error,
                t("account.emailChangeError"),
            ));
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
                addToast(t("account.title"), t("account.loadError"));
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
                addToast(t("account.notifications.title"), t("account.notifications.updateError"));
            } finally {
                setIsNotificationsLoading(false);
            }
        };

        loadNotifications();
    }, [addToast, uid]);

    useEffect(() => {
        const notificationsRouteActive = location.pathname === CUSTOMER_ROUTES.notifications || location.hash === "#notifications";
        if (loading || !notificationsRouteActive) return;

        const notificationsSection = document.getElementById("account-notifications");
        if (notificationsSection && typeof notificationsSection.scrollIntoView === "function") {
            notificationsSection.scrollIntoView({ block: "start" });
        }
    }, [loading, location.hash, location.pathname]);

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
                t("account.notifications.markAllComplete", result.updated),
            );
        } catch {
            addToast(t("account.notifications.title"), t("account.notifications.updateError"));
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
            addToast(t("account.notifications.title"), t("account.notifications.markedRead"));
        } catch {
            addToast(t("account.notifications.title"), t("account.notifications.updateError"));
        } finally {
            setIsMarkingNotificationId(null);
        }
    };

    const recentOrders = useMemo(() => orders.slice(0, 3), [orders]);
    const primaryAddress = useMemo(
        () => addresses.find((address) => address.is_default) || addresses[0] || null,
        [addresses],
    );
    const emailIsUnverified = (userData?.email_verified ?? customer?.email_verified) === false;
    return (
        <Layout>
            <Helmet>
                <title>{t("account.metaTitle")}</title>
                <meta name="description" content={t("account.metaDescription")} />
            </Helmet>
            <main className="customer-account-page">
                <CustomerAccountShell
                    eyebrow={t("account.eyebrow")}
                    title={t("account.title")}
                    description={t("account.description")}
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
                                    {t("account.customerBadge")}
                                </span>
                                <h2>{getDisplayName(customer, t("account.customerFallback"))}</h2>
                                <p>{customer?.email || userData?.email || t("account.noEmail")}</p>
                                {emailIsUnverified ? (
                                    <button type="button" onClick={resendVerification} disabled={isSendingVerification}>
                                        {isSendingVerification ? t("account.sendingVerification") : t("account.resendVerification")}
                                    </button>
                                ) : null}
                                <small>{t("account.lastActive", customer?.last_login ? formatUtcDateTime(customer.last_login) : t("account.recently"))}</small>
                                <form className="customer-account-page__email-change" onSubmit={requestEmailChange}>
                                    <label htmlFor="customer-account-new-email">{t("account.newEmail")}</label>
                                    <div className="customer-account-page__email-change__controls">
                                        <input
                                            id="customer-account-new-email"
                                            type="email"
                                            autoComplete="email"
                                            value={newEmail}
                                            onChange={(event) => setNewEmail(event.target.value)}
                                            placeholder={t("account.newEmailPlaceholder")}
                                            required
                                        />
                                        <button type="submit" disabled={isRequestingEmailChange}>
                                            {isRequestingEmailChange ? t("account.sending") : t("account.sendEmailChange")}
                                        </button>
                                    </div>
                                    {emailChangeMessage ? (
                                        <p role={emailChangeError ? "alert" : "status"}>{emailChangeMessage}</p>
                                    ) : null}
                                </form>
                            </div>

                            <div className="customer-account-page__stats">
                                <article>
                                    <span>{t("account.ordersLabel")}</span>
                                    <strong>{orders.length}</strong>
                                </article>
                                <article>
                                    <span>{t("account.addressesLabel")}</span>
                                    <strong>{addresses.length}</strong>
                                </article>
                            </div>
                        </section>

                        <section className="customer-account-page__workflow" aria-label={t("account.workflowAria")}>
                            <Link to={CUSTOMER_ROUTES.orders}>
                                <span>
                                    <CartIcon size={18} />
                                </span>
                                <strong>{t("account.reviewOrders")}</strong>
                                <small>{t("account.reviewOrdersDescription")}</small>
                            </Link>
                            <Link to={CUSTOMER_ROUTES.addresses}>
                                <span>
                                    <HouseIcon size={18} />
                                </span>
                                <strong>{t("account.manageShipping")}</strong>
                                <small>{t("account.manageShippingDescription")}</small>
                            </Link>
                        </section>

                        <section className="customer-account-page__grid">
                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>{t("account.recentOrders")}</h3>
                                    <Link to={CUSTOMER_ROUTES.orders}>{t("account.viewAll")}</Link>
                                </div>
                                <div className="customer-account-page__panel-body">
                                    {recentOrders.length > 0 ? (
                                        <div className="customer-account-page__order-list">
                                            {recentOrders.map((order) => (
                                                <Link key={order.id} to={customerOrderRoute(order.id)}>
                                                    <div>
                                                        <strong>{t("orders.orderLabel", order.id)}</strong>
                                                        <span>{formatUtcDate(order.date_added)}</span>
                                                    </div>
                                                    <div>
                                                        <em>{getStatusLabel(order.status, t)}</em>
                                                        <small>{formatCurrency(Math.max(order.total_price - order.discount, 0))}</small>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState
                                            compact
                                            className="customer-account-page__empty"
                                            title={t("account.noOrders")}
                                            description={t("account.noOrdersDescription")}
                                            actionLabel={t("account.startShopping")}
                                            actionTo="/shops"
                                        />
                                    )}
                                </div>
                            </article>

                            <article className="customer-account-page__panel">
                                <div className="customer-account-page__panel__header">
                                    <h3>{t("account.savedAddress")}</h3>
                                    <Link to={CUSTOMER_ROUTES.addresses}>{t("account.manage")}</Link>
                                </div>
                                <div className="customer-account-page__panel-body">
                                    {primaryAddress ? (
                                        <div className="customer-account-page__address">
                                            <strong>{primaryAddress.label}</strong>
                                            <p>{primaryAddress.address_line}</p>
                                            <span>
                                                {[primaryAddress.city, primaryAddress.country].filter(Boolean).join(", ") ||
                                                    t("account.locationNotSpecified")}
                                            </span>
                                            <small>
                                                {[primaryAddress.recipient_name, primaryAddress.phone_number]
                                                    .filter(Boolean)
                                                    .join(" | ") || t("account.noRecipientDetails")}
                                            </small>
                                        </div>
                                    ) : (
                                        <EmptyState
                                            compact
                                            className="customer-account-page__empty"
                                            title={t("account.noSavedAddresses")}
                                            description={t("account.noSavedAddressesDescription")}
                                            actionLabel={t("account.manageAddresses")}
                                            actionTo={CUSTOMER_ROUTES.addresses}
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
                                    <span>{t("account.notifications.eyebrow")}</span>
                                    <h3 id="account-notifications-heading">{t("account.notifications.title")}</h3>
                                    <p>
                                        {unreadNotificationCount > 0
                                            ? t("account.notifications.unreadSummary", unreadNotificationCount)
                                            : t("account.notifications.emptySummary")}
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
                                    {isMarkingAllNotificationsRead ? t("account.notifications.updating") : t("account.notifications.markAllRead")}
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
                                        {notifications.map((notification) => {
                                            const copy = getNotificationCopy(notification, t);
                                            return (
                                            <article
                                                key={notification.id}
                                                className={notification.is_read ? "" : "is-unread"}
                                            >
                                                <div className="customer-account-page__notification-header">
                                                    <button
                                                        type="button"
                                                        className="customer-account-page__notification-trigger"
                                                        aria-label={copy.title}
                                                        aria-expanded={expandedNotificationId === notification.id}
                                                        aria-controls={expandedNotificationId === notification.id
                                                            ? `account-notification-details-${notification.id}`
                                                            : undefined}
                                                        onClick={() => setExpandedNotificationId((current) =>
                                                            current === notification.id ? null : notification.id,
                                                        )}
                                                    >
                                                        <span className="customer-account-page__notification-meta">
                                                            <span>{copy.typeLabel}</span>
                                                            <small>{formatUtcDateTime(notification.created_at)}</small>
                                                        </span>
                                                        <strong>{copy.title}</strong>
                                                        <span className="customer-account-page__notification-toggle">
                                                            {expandedNotificationId === notification.id
                                                                ? t("account.notifications.hideDetails")
                                                                : t("account.notifications.viewDetails")}
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
                                                            ? t("account.notifications.notificationIsRead", copy.title)
                                                            : t("account.notifications.markNotificationRead", copy.title)}
                                                    >
                                                        {isMarkingNotificationId === notification.id
                                                            ? t("account.notifications.saving")
                                                            : notification.is_read ? t("account.notifications.read") : t("account.notifications.markRead")}
                                                    </button>
                                                </div>
                                                {expandedNotificationId === notification.id ? (
                                                    <div
                                                        id={`account-notification-details-${notification.id}`}
                                                        className="customer-account-page__notification-detail"
                                                    >
                                                        <p>{copy.message}</p>
                                                        {notification.link ? (
                                                            <Link to={notification.link}>{t("account.notifications.openDetails")}</Link>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </article>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <EmptyState
                                        compact
                                        className="customer-account-page__empty"
                                        title={t("account.notifications.noNotifications")}
                                        description={t("account.notifications.noNotificationsDescription")}
                                        actionLabel={t("account.notifications.browseProducts")}
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
