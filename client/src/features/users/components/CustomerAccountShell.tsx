import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BellIcon, CartIcon, HouseIcon, PersonIcon } from "../../../components/common/Icons";
import "../../../styles/CustomerAccountShell.scss";

type CustomerAccountShellProps = {
    eyebrow: string;
    title: string;
    description: string;
    actions?: React.ReactNode;
};

const navItems = [
    { to: "/account", label: "Account", helper: "Overview", icon: <PersonIcon size={16} /> },
    { to: "/orders", label: "Orders", helper: "History", icon: <CartIcon size={16} /> },
    { to: "/addresses", label: "Addresses", helper: "Shipping", icon: <HouseIcon size={16} /> },
    { to: "/notifications", label: "Notifications", helper: "Updates", icon: <BellIcon size={16} /> },
];

const CustomerAccountShell = ({ eyebrow, title, description, actions }: CustomerAccountShellProps) => {
    const location = useLocation();

    return (
        <section className="customer-account-shell">
            <div className="customer-account-shell__header">
                <div>
                    <span>{eyebrow}</span>
                    <h1>{title}</h1>
                    <p>{description}</p>
                </div>
                {actions ? <div className="customer-account-shell__actions">{actions}</div> : null}
            </div>

            <nav className="customer-account-shell__nav" aria-label="Customer account navigation">
                {navItems.map((item, index) => {
                    const isActive = location.pathname === item.to;

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
