import React from "react";
import { ArrowLeftIcon, ArrowRightIcon, BellFillIcon, BoxSeamIcon, CartIcon, CashStackIcon, PersonIcon, SpeedometerIcon, TelephoneIcon } from "../common/Icons";
import { NavLink } from "react-router-dom";
import { useAdminDashboardCopy } from "../../hooks/useAdminDashboardCopy";

const adminNavGroups = [
    {
        label: "Overview",
        items: [
            { label: "Dashboard", path: "/admin", match: "dashboard", icon: <SpeedometerIcon size={20} /> },
        ],
    },
    {
        label: "Operations",
        items: [
            { label: "Notifications", path: "/admin/notifications", match: "notifications", icon: <BellFillIcon size={20} /> },
            { label: "Orders", path: "/admin/orders", match: "orders", icon: <CartIcon size={20} /> },
            { label: "Fulfillment", path: "/admin/fulfillment", match: "fulfillment", icon: <BoxSeamIcon size={20} /> },
            { label: "Support", path: "/admin/support", match: "support", icon: <TelephoneIcon size={20} /> },
            { label: "After-sales", path: "/admin/after-sales", match: "after-sales", icon: <TelephoneIcon size={20} /> },
        ],
    },
    {
        label: "Catalog & growth",
        items: [
            { label: "Products", path: "/admin/products", match: "products", icon: <BoxSeamIcon size={20} /> },
            { label: "Promotions", path: "/admin/promotions", match: "promotions", icon: <CashStackIcon size={20} /> },
        ],
    },
    {
        label: "Finance",
        items: [
            { label: "Payment reconciliation", path: "/admin/payments/reconciliation", match: "payments", icon: <CashStackIcon size={20} /> },
            { label: "COD settlements", path: "/admin/payments/cod-settlements", match: "cod-settlements", icon: <CashStackIcon size={20} /> },
        ],
    },
    {
        label: "Store settings",
        items: [
            { label: "Delivery settings", path: "/admin/delivery/settings", match: "delivery-settings", icon: <BoxSeamIcon size={20} /> },
            { label: "Accounts", path: "/admin/accounts", match: "accounts", icon: <PersonIcon size={20} /> },
            { label: "Email operations", path: "/admin/email-operations", match: "email-operations", icon: <TelephoneIcon size={20} /> },
            { label: "Audit log", path: "/admin/audit", match: "audit", icon: <PersonIcon size={20} /> },
        ],
    },
];

type AdminSidebarProps = {
    isOpen?: boolean;
    isCollapsed?: boolean;
    onClose?: () => void;
    onToggleCollapsed?: () => void;
};

const AdminSidebar = ({ isOpen = false, isCollapsed = false, onClose, onToggleCollapsed }: AdminSidebarProps) => {
    const tx = useAdminDashboardCopy();
    return (
        <aside
            id="admin-navigation"
            className={`admin__layout__sidebar${isOpen ? " is-open" : ""}${isCollapsed ? " is-collapsed" : ""}`}
            aria-label={tx("Admin navigation panel")}
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
                    <span className="admin__layout__sidebar__title__tag">{tx("Admin Panel")}</span>
                </section>
                <button
                    type="button"
                    className="admin__layout__sidebar__collapse"
                    onClick={onToggleCollapsed}
                    aria-controls="admin-navigation"
                    aria-expanded={!isCollapsed}
                    aria-label={tx(isCollapsed ? "Expand admin navigation" : "Collapse admin navigation")}
                    title={tx(isCollapsed ? "Expand navigation" : "Collapse navigation")}
                >
                    {isCollapsed ? <ArrowRightIcon size={18} /> : <ArrowLeftIcon size={18} />}
                    <span>{tx(isCollapsed ? "Expand" : "Collapse")}</span>
                </button>
            </div>

            {/* Navigation */}
            <nav className="admin__layout__sidebar__navigation" aria-label={tx("Admin navigation")}>
                {adminNavGroups.map((group) => (
                    <div className="admin__layout__sidebar__navigation__group" key={group.label}>
                        <span className="admin__layout__sidebar__navigation__caption">{tx(group.label)}</span>
                        {group.items.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.match === "dashboard"}
                                onClick={onClose}
                                className={({ isActive }) =>
                                    `admin__layout__sidebar__navigation__item${isActive ? " active" : ""}`
                                }
                                title={isCollapsed ? tx(item.label) : undefined}
                            >
                                <span className="admin__layout__sidebar__navigation__icon">{item.icon}</span>
                                <span className="admin__layout__sidebar__navigation__label">{tx(item.label)}</span>
                            </NavLink>
                        ))}
                    </div>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
