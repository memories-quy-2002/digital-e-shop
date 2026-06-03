import React from "react";
import { BellIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon, SpeedometerIcon } from "../common/Icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const adminNavItems = [
    { label: "Dashboard", path: "/admin", match: "dashboard", icon: <SpeedometerIcon size={20} /> },
    { label: "Orders", path: "/admin/orders", match: "orders", icon: <CartIcon size={20} /> },
    { label: "Products", path: "/admin/products", match: "products", icon: <BoxSeamIcon size={20} /> },
    { label: "Promotions", path: "/admin/promotions", match: "promotions", icon: <CashStackIcon size={20} /> },
    { label: "Accounts", path: "/admin/accounts", match: "accounts", icon: <PersonIcon size={20} /> },
    { label: "Notifications", path: "/admin/notifications", match: "notifications", icon: <BellIcon size={20} /> },
];

const getDisplayName = (username?: string, firstName?: string | null, lastName?: string | null) => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    return fullName || username || "Anonymous";
};

const getInitials = (username?: string, firstName?: string | null, lastName?: string | null) => {
    const displayName = getDisplayName(username, firstName, lastName);
    return displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");
};

const AdminSidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const paramItem = location.pathname.split("/admin/")[1];
    const { userData, loading } = useAuth();
    const displayName = getDisplayName(userData?.username, userData?.first_name, userData?.last_name);
    const initials = getInitials(userData?.username, userData?.first_name, userData?.last_name);

    return (
        <aside className="admin__layout__sidebar">
            {/* Logo / Brand */}
            <section className="admin__layout__sidebar__title">
                <p className="admin__layout__sidebar__title__brand">DIGITAL-E</p>
                <span className="admin__layout__sidebar__title__tag">Admin Panel</span>
            </section>

            {/* User Info */}
            <section className="admin__layout__sidebar__information">
                <div
                    className="admin__layout__sidebar__information__avatar"
                    aria-label={`${displayName} avatar`}
                    title={displayName}
                >
                    {initials}
                </div>
                <div className="admin__layout__sidebar__information__user">
                    <strong>{userData && !loading ? displayName : "Anonymous"}</strong>
                    <span>{userData && !loading ? userData.email : "anonymous@example.com"}</span>
                </div>
            </section>

            {/* Navigation */}
            <nav className="admin__layout__sidebar__navigation">
                <span className="admin__layout__sidebar__navigation__caption">Workspace</span>
                {adminNavItems.map((item) => (
                    <button
                        type="button"
                        key={item.path}
                        onClick={() => navigate(item.path)}
                        className={`admin__layout__sidebar__navigation__item ${
                            paramItem === item.match || (!paramItem && item.match === "dashboard") ? "active" : ""
                        }`}
                    >
                        <span className="admin__layout__sidebar__navigation__icon">{item.icon}</span>
                        <span className="admin__layout__sidebar__navigation__label">{item.label}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
