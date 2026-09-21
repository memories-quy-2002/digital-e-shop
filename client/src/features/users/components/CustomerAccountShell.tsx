import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BellIcon, CartIcon, HouseIcon, PersonIcon } from "../../../components/common/Icons";
import { useT } from "../../../hooks/useT";
import { CUSTOMER_ROUTES } from "../../../routes/customerRoutes";
import "../../../styles/features/users/_customer-account-shell.scss";

type CustomerAccountShellProps = {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: React.ReactNode;
};

const CustomerAccountShell = ({
    eyebrow,
    title,
    description,
    actions,
}: CustomerAccountShellProps) => {
    const location = useLocation();
    const t = useT();
    const navItems = [
        { to: CUSTOMER_ROUTES.account, label: t("accountNav.account"), helper: t("accountNav.accountHelper"), icon: <PersonIcon size={16} /> },
        { to: CUSTOMER_ROUTES.orders, label: t("accountNav.orders"), helper: t("accountNav.ordersHelper"), icon: <CartIcon size={16} /> },
        { to: CUSTOMER_ROUTES.addresses, label: t("accountNav.addresses"), helper: t("accountNav.addressesHelper"), icon: <HouseIcon size={16} /> },
        { to: CUSTOMER_ROUTES.notifications, label: t("accountNav.notifications"), helper: t("accountNav.notificationsHelper"), icon: <BellIcon size={16} /> },
    ];

    return (
        <section className="customer-account-shell">
            <div className="customer-account-shell__header">
                <div>
                    {eyebrow ? <span>{eyebrow}</span> : null}
                    <h1>{title}</h1>
                    {description ? <p>{description}</p> : null}
                </div>
                {actions ? <div className="customer-account-shell__actions">{actions}</div> : null}
            </div>

            <nav className="customer-account-shell__nav" aria-label={t("accountNav.ariaLabel")}>
                {navItems.map((item, index) => {
                    const isNotifications = item.to === CUSTOMER_ROUTES.notifications;
                    const isAccountOverview = item.to === CUSTOMER_ROUTES.account;
                    const isActive = isNotifications
                        ? (location.pathname === CUSTOMER_ROUTES.notifications
                            || (location.pathname === CUSTOMER_ROUTES.account && location.hash === "#notifications"))
                        : isAccountOverview
                            ? location.pathname === CUSTOMER_ROUTES.account && location.hash !== "#notifications"
                            : location.pathname === item.to;

                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={
                                isActive
                                    ? "customer-account-shell__nav-link is-active"
                                    : "customer-account-shell__nav-link"
                            }
                            aria-current={isActive ? "page" : undefined}
                        >
                            <span className="customer-account-shell__nav-index">{index + 1}</span>
                            <span className="customer-account-shell__nav-icon">{item.icon}</span>
                            <span className="customer-account-shell__nav-copy">
                                <strong>{item.label}</strong>
                                <small>{item.helper}</small>
                            </span>
                        </Link>
                    );
                })}
            </nav>
        </section>
    );
};

export default CustomerAccountShell;