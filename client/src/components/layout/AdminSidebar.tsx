import React from "react";
import { ArrowLeftIcon, ArrowRightIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon, SpeedometerIcon, TelephoneIcon } from "../common/Icons";
import { NavLink } from "react-router-dom";

const adminNavItems = [
    { label: "Dashboard", path: "/admin", match: "dashboard", icon: <SpeedometerIcon size={20} /> },
    { label: "Orders", path: "/admin/orders", match: "orders", icon: <CartIcon size={20} /> },
    { label: "Products", path: "/admin/products", match: "products", icon: <BoxSeamIcon size={20} /> },
    { label: "Promotions", path: "/admin/promotions", match: "promotions", icon: <CashStackIcon size={20} /> },
    { label: "Accounts", path: "/admin/accounts", match: "accounts", icon: <PersonIcon size={20} /> },
    { label: "Support", path: "/admin/support", match: "support", icon: <TelephoneIcon size={20} /> },
];

type AdminSidebarProps = {
    isOpen?: boolean;
    isCollapsed?: boolean;
    onClose?: () => void;
    onToggleCollapsed?: () => void;
};

const AdminSidebar = ({ isOpen = false, isCollapsed = false, onClose, onToggleCollapsed }: AdminSidebarProps) => {
    return (
        <aside
            id="admin-navigation"
            className={`admin__layout__sidebar${isOpen ? " is-open" : ""}${isCollapsed ? " is-collapsed" : ""}`}
            aria-label="Admin navigation panel"
        >
            <div className="admin__layout__sidebar__header">
                {/* Logo / Brand */}
                <section className="admin__layout__sidebar__title">
                    <p className="admin__layout__sidebar__title__brand">
                        <span role="img" aria-label="Digital-E">
                            <span className="admin__layout__sidebar__title__brand__full" aria-hidden="true">
                                DIGITAL-E
                            </span>
                            <span className="admin__layout__sidebar__title__brand__collapsed" aria-hidden="true">
                                DE
                            </span>
                        </span>
                    </p>
                    <span className="admin__layout__sidebar__title__tag">Admin Panel</span>
                </section>
                <button
                    type="button"
                    className="admin__layout__sidebar__collapse"
                    onClick={onToggleCollapsed}
                    aria-controls="admin-navigation"
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? "Expand admin navigation" : "Collapse admin navigation"}
                    title={isCollapsed ? "Expand navigation" : "Collapse navigation"}
                >
                    {isCollapsed ? <ArrowRightIcon size={18} /> : <ArrowLeftIcon size={18} />}
                    <span>{isCollapsed ? "Expand" : "Collapse"}</span>
                </button>
            </div>

            {/* Navigation */}
            <nav className="admin__layout__sidebar__navigation" aria-label="Admin navigation">
                <span className="admin__layout__sidebar__navigation__caption">Workspace</span>
                {adminNavItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        end={item.match === "dashboard"}
                        onClick={onClose}
                        className={({ isActive }) =>
                            `admin__layout__sidebar__navigation__item${isActive ? " active" : ""}`
                        }
                        title={isCollapsed ? item.label : undefined}
                    >
                        <span className="admin__layout__sidebar__navigation__icon">{item.icon}</span>
                        <span className="admin__layout__sidebar__navigation__label">{item.label}</span>
                    </NavLink>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
