import React from "react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, HouseIcon } from "../common/Icons";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAdminDashboardCopy } from "../../hooks/useAdminDashboardCopy";
import { adminNavGroups } from "./adminNavigation";

type AdminSidebarProps = {
    isOpen?: boolean;
    isMobile?: boolean;
    isCollapsed?: boolean;
    onClose?: () => void;
    onToggleCollapsed?: () => void;
};

const AdminSidebar = ({ isOpen = false, isMobile = false, isCollapsed = false, onClose, onToggleCollapsed }: AdminSidebarProps) => {
    const tx = useAdminDashboardCopy();
    const { pathname } = useLocation();
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>(() =>
        Object.fromEntries(
            adminNavGroups
                .filter((group) => group.collapsible)
                .map((group) => [
                    group.label,
                    Boolean(group.defaultExpanded) || group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`)),
                ]),
        ),
    );
    const previousPathname = React.useRef(pathname);

    React.useEffect(() => {
        if (previousPathname.current === pathname) return;
        previousPathname.current = pathname;

        adminNavGroups.forEach((group) => {
            if (!group.collapsible) return;
            const isActive = group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
            setExpandedGroups((current) => current[group.label] === isActive ? current : { ...current, [group.label]: isActive });
        });
    }, [pathname]);

    return (
        <aside
            id="admin-navigation"
            className={`admin__layout__sidebar${isOpen ? " is-open" : ""}${isCollapsed ? " is-collapsed" : ""}`}
            aria-label={tx("Admin navigation panel")}
            inert={isMobile && !isOpen}
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
                        {group.collapsible ? (
                            <button
                                type="button"
                                className={`admin__layout__sidebar__navigation__caption admin__layout__sidebar__navigation__caption-toggle${expandedGroups[group.label] ? " is-expanded" : ""}`}
                                aria-expanded={Boolean(expandedGroups[group.label])}
                                aria-controls={`admin-navigation-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                                title={isCollapsed ? tx(group.label) : undefined}
                                onClick={() => setExpandedGroups((current) => ({ ...current, [group.label]: !current[group.label] }))}
                            >
                                <span>{tx(group.label)}</span>
                                <ArrowDownIcon size={15} />
                            </button>
                        ) : (
                            <span className="admin__layout__sidebar__navigation__caption">{tx(group.label)}</span>
                        )}
                        <div
                            id={`admin-navigation-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                            className="admin__layout__sidebar__navigation__group-items"
                            hidden={Boolean(group.collapsible && !expandedGroups[group.label])}
                        >
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
                    </div>
                ))}
            </nav>

            <div className="admin__layout__sidebar__footer">
                <Link
                    to="/"
                    className="admin__layout__sidebar__storefront"
                    aria-label={tx("Open storefront")}
                    title={isCollapsed ? tx("Open storefront") : undefined}
                    onClick={onClose}
                >
                    <HouseIcon size={19} />
                    <span className="admin__layout__sidebar__storefront__label">{tx("Storefront")}</span>
                </Link>
            </div>
        </aside>
    );
};

export default AdminSidebar;
