import React from "react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, HouseIcon } from "../common/Icons";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAdminDashboardCopy } from "../../hooks/useAdminDashboardCopy";
import { adminNavGroups } from "./adminNavigation";

const EXPANDED_GROUPS_STORAGE_KEY = "digital-e.admin-sidebar.expanded-groups.v1";

const getInitialExpandedGroups = (pathname: string): Record<string, boolean> => {
    let stored: Record<string, unknown> = {};
    try {
        const parsed: unknown = JSON.parse(window.sessionStorage.getItem(EXPANDED_GROUPS_STORAGE_KEY) ?? "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) stored = parsed as Record<string, unknown>;
    } catch {
        // Storage may be unavailable in restricted browser contexts; keep navigation usable.
    }

    return Object.fromEntries(adminNavGroups.filter((group) => group.collapsible).map((group) => {
        const isActive = group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`));
        return [group.label, isActive || (typeof stored[group.label] === "boolean" ? stored[group.label] : Boolean(group.defaultExpanded))];
    })) as Record<string, boolean>;
};

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
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>(() => getInitialExpandedGroups(pathname));
    const previousPathname = React.useRef(pathname);

    React.useEffect(() => {
        try {
            window.sessionStorage.setItem(EXPANDED_GROUPS_STORAGE_KEY, JSON.stringify(expandedGroups));
        } catch {
            // The in-memory state remains authoritative for the current mount.
        }
    }, [expandedGroups]);

    React.useEffect(() => {
        if (previousPathname.current === pathname) return;
        previousPathname.current = pathname;

        const activeGroup = adminNavGroups.find((group) =>
            group.collapsible
            && group.items.some((item) => pathname === item.path || pathname.startsWith(`${item.path}/`)),
        );
        if (!activeGroup) return;

        setExpandedGroups((current) => current[activeGroup.label]
            ? current
            : { ...current, [activeGroup.label]: true });
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
