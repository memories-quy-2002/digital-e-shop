import React from "react";
import { Link, useLocation } from "react-router-dom";
import { BellIcon, CartIcon, HouseIcon, PersonIcon } from "../Icons";
import "../../../styles/CustomerAccountShell.scss";

type CustomerAccountShellProps = {
    eyebrow: string;
    title: string;
    description: string;
    actions?: React.ReactNode;
};

const navItems = [
    { to: "/account", label: "Account", icon: <PersonIcon size={16} /> },
    { to: "/orders", label: "Orders", icon: <CartIcon size={16} /> },
    { to: "/addresses", label: "Addresses", icon: <HouseIcon size={16} /> },
    { to: "/notifications", label: "Notifications", icon: <BellIcon size={16} /> },
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
                {navItems.map((item) => (
                    <Link key={item.to} to={item.to} className={location.pathname === item.to ? "is-active" : ""}>
                        {item.icon}
                        <span>{item.label}</span>
                    </Link>
                ))}
            </nav>
        </section>
    );
};

export default CustomerAccountShell;
