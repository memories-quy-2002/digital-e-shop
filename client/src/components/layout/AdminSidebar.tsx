import React from "react";
import { BoxSeamIcon, CartIcon, PersonIcon, SpeedometerIcon } from "../common/Icons";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const items = ["Dashboard", "Products", "Orders", "Accounts"];
const itemIcons = [
    <SpeedometerIcon size={20} key={0} />,
    <BoxSeamIcon size={20} key={1} />,
    <CartIcon size={20} key={2} />,
    <PersonIcon size={20} key={3} />,
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
    const url = window.location.href;
    const paramItem = url.split("/admin/")[1];
    const { userData, loading } = useAuth();
    const displayName = getDisplayName(userData?.username, userData?.first_name, userData?.last_name);
    const initials = getInitials(userData?.username, userData?.first_name, userData?.last_name);

    const handleAdminNavigate = (item: string) => {
        if (item === "dashboard") {
            navigate("/admin");
        } else {
            navigate(`/admin/${item}`);
        }
    };

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
                {items.map((item, index) => (
                    <button
                        type="button"
                        key={index}
                        onClick={() => handleAdminNavigate(item.toLowerCase())}
                        className={`admin__layout__sidebar__navigation__item ${
                            paramItem === item.toLowerCase() || (!paramItem && item === "Dashboard") ? "active" : ""
                        }`}
                    >
                        <span className="admin__layout__sidebar__navigation__icon">{itemIcons[index]}</span>
                        <span className="admin__layout__sidebar__navigation__label">{item}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
