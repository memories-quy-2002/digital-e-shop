import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "../ui/legacy";
import { BellIcon, BoxArrowRightIcon, HouseIcon, MenuIcon, SearchIcon } from "../common/Icons";
import { useToast } from "../../context/ToastContext";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { signOutFirebaseUser } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatUtcDateTime } from "../../utils/dateTime";
import { acknowledgeAdminAlerts, fetchAdminAlerts, type AdminAlert } from "../../features/admin/api";
import AdminStatusPanel from "../../features/admin/components/AdminStatusPanel";
import ColorSchemeDropdown from "../common/ColorSchemeDropdown";
import LanguageDropdown from "../common/LanguageDropdown";
import { getAdminRequestError, type AdminRequestError } from "../../features/admin/utils/adminRequestError";
import { getApiSuccessMessage } from "../../lib/api-contract";
import { logoutCurrentCustomer } from "../../features/users/api";
import { useAdminDashboardCopy } from "../../hooks/useAdminDashboardCopy";

const POLL_INTERVAL = 60000;

const getDisplayName = (username?: string, firstName?: string | null, lastName?: string | null) => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    return fullName || username || "";
};

const getInitials = (displayName: string) =>
    displayName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() || "")
        .join("");

const getSearchRoute = (keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
        return "/admin";
    }

    if (
        normalizedKeyword.includes("product") ||
        normalizedKeyword.includes("catalog") ||
        normalizedKeyword.includes("inventory")
    ) {
        return "/admin/products";
    }

    if (normalizedKeyword.includes("order") || normalizedKeyword.includes("payment")) {
        return "/admin/orders";
    }

    if (normalizedKeyword.includes("account") || normalizedKeyword.includes("user") || normalizedKeyword.includes("customer")) {
        return "/admin/accounts";
    }

    return "/admin";
};

type AdminHeaderProps = {
    onOpenSidebar?: () => void;
    isSidebarOpen?: boolean;
};

const AdminHeader = ({ onOpenSidebar, isSidebarOpen = false }: AdminHeaderProps) => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const { userData, loading } = useAuth();
    const tx = useAdminDashboardCopy();
    const [showLogout, setShowLogout] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showNotifications, setShowNotifications] = useState(false);
    const [activities, setActivities] = useState<AdminAlert[]>([]);
    const [activityStatus, setActivityStatus] = useState<"loading" | "success" | "error">("loading");
    const [activityError, setActivityError] = useState<AdminRequestError | null>(null);
    const notificationsTriggerRef = useRef<HTMLButtonElement>(null);

    const displayName = useMemo(
        () => getDisplayName(userData?.username, userData?.first_name, userData?.last_name),
        [userData?.first_name, userData?.last_name, userData?.username],
    );
    const initials = useMemo(() => getInitials(displayName), [displayName]);

    const syncActivityFeed = React.useCallback(
        async (isInitialLoad = false) => {
            setActivityStatus("loading");
            setActivityError(null);
            try {
                const { alerts } = await fetchAdminAlerts();
                setActivities(alerts.filter((alert) => alert.triageStatus !== "RESOLVED"));
                setActivityStatus("success");
            } catch (error) {
                setActivityError(getAdminRequestError(error));
                setActivityStatus("error");
                if (!isInitialLoad) {
                    addToast(tx("Notifications"), tx("Activity sync failed. Showing the latest saved feed."));
                }
            }
        },
        [addToast, tx],
    );

    useEffect(() => {
        syncActivityFeed(true);
        const intervalId = window.setInterval(() => {
            syncActivityFeed(false);
        }, POLL_INTERVAL);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [syncActivityFeed]);

    const unreadCount = activities.filter((activity) => activity.unread).length;

    const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const route = getSearchRoute(searchTerm);
        navigate(route);
        if (searchTerm.trim() && route === "/admin") {
            addToast(tx("Admin navigation"), tx("Choose Products, Orders, or Accounts from the section search."));
        }
    };

    const closeNotifications = React.useCallback(() => {
        setShowNotifications(false);
        window.setTimeout(() => notificationsTriggerRef.current?.focus(), 0);
    }, []);

    useEffect(() => {
        if (!showNotifications) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeNotifications();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeNotifications, showNotifications]);

    const toggleNotifications = () => {
        setShowNotifications((current) => !current);
    };

    const markActivityRead = (activity: AdminAlert) => {
        if (!activity.unread) return;
        void acknowledgeAdminAlerts([activity.id])
            .then(() => setActivities((current) => current.map((item) => item.id === activity.id ? { ...item, unread: false } : item)))
            .catch(() => addToast(tx("Activity feed"), tx("Unable to mark alert as read.")));
    };

    const handleMarkAllRead = async () => {
        const unreadIds = activities.filter((activity) => activity.unread).map((activity) => activity.id);
        if (unreadIds.length === 0) return;
        try {
            await acknowledgeAdminAlerts(unreadIds);
            const readIds = new Set(unreadIds);
            setActivities((current) => current.map((activity) => readIds.has(activity.id) ? { ...activity, unread: false } : activity));
            addToast(tx("Activity feed"), `${unreadIds.length} ${tx(unreadIds.length === 1 ? "alert marked as read." : "alerts marked as read.")}`);
        } catch {
            addToast(tx("Activity feed"), tx("Unable to mark alerts as read."));
        }
    };

    const handleLogout = async () => {
        try {
            const response = await logoutCurrentCustomer();
            sessionStorage.removeItem("rememberMe");
            // Load cookie manipulation only when signing out; it is not needed on dashboard paint.
            const { default: Cookies } = await import("universal-cookie");
            new Cookies().remove("rememberMe");
            await signOutFirebaseUser();
            addToast(tx("Logout successfully"), getApiSuccessMessage(response, tx("Logged out")));
        } catch {
            addToast(tx("Logout"), tx("You have been logged out."));
        } finally {
            navigate("/login");
        }
    };

    return (
        <header className="admin__layout__main__header">
            <Helmet>
                <title>{tx("Digital-E - Admin")}</title>
                <meta name="description" content={tx("Admin Dashboard for Digital-E")} />
            </Helmet>

            <div className="admin__layout__main__header__left">
                <button
                    type="button"
                    className="admin__layout__main__header__menu"
                    aria-label={tx("Open admin navigation")}
                    aria-controls="admin-navigation"
                    aria-expanded={isSidebarOpen}
                    onClick={onOpenSidebar}
                >
                    <MenuIcon size={21} />
                </button>
                <button
                    type="button"
                    className="admin__layout__main__header__home"
                    aria-label={tx("Open storefront")}
                    onClick={() => navigate("/")}
                >
                    <HouseIcon />
                    <span>{tx("Storefront")}</span>
                </button>

                <form className="admin__layout__main__header__search" onSubmit={handleSearchSubmit}>
                    <label className="admin__sr-only" htmlFor="admin-search">
                        {tx("Jump to an Admin section")}
                    </label>
                    <input
                        id="admin-search"
                        type="text"
                        placeholder={tx("Jump to Products, Orders, or Accounts…")}
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <button type="submit" aria-label={tx("Jump to Admin section")}>
                        <SearchIcon size={20} />
                    </button>
                </form>
            </div>

            <div className="admin__layout__main__header__right">
                <LanguageDropdown align="right" />
                <ColorSchemeDropdown align="right" />
                <div className="admin__layout__main__header__notifications">
                    <button
                        type="button"
                        className="admin__layout__main__header__notifications__trigger"
                        onClick={toggleNotifications}
                        ref={notificationsTriggerRef}
                        aria-expanded={showNotifications}
                        aria-controls="admin-notifications-popover"
                        aria-label={`${tx("Notifications")}${unreadCount > 0 ? `, ${unreadCount} ${tx("unread")}` : ""}`}
                    >
                        <BellIcon className="admin__layout__main__header__notifications__icon" size={24} />
                        {unreadCount > 0 && (
                            <span className="admin__layout__main__header__notifications__badge">{unreadCount}</span>
                        )}
                    </button>

                    {showNotifications && (
                        <div
                            id="admin-notifications-popover"
                            className="admin__layout__main__header__notifications__panel"
                            role="dialog"
                            aria-labelledby="admin-notifications-title"
                        >
                            <div className="admin__layout__main__header__notifications__panel-header">
                                <div>
                                    <strong id="admin-notifications-title">{tx("Activity feed")}</strong>
                                    <span>{tx("Latest store events for admin review")}</span>
                                </div>
                                <div className="admin__layout__main__header__notifications__panel-actions">
                                    <button
                                        type="button"
                                        className="admin__layout__main__header__notifications__mark-all"
                                        onClick={handleMarkAllRead}
                                        disabled={unreadCount === 0 || activityStatus === "loading"}
                                    >
                                        {tx("Mark all as read")}
                                    </button>
                                    <button
                                        type="button"
                                        className="admin__layout__main__header__notifications__refresh"
                                        onClick={() => syncActivityFeed(false)}
                                    >
                                        {tx("Refresh")}
                                    </button>
                                </div>
                            </div>
                            <div className="admin__layout__main__header__notifications__list">
                                {activityStatus === "error" && activities.length === 0 ? (
                                    <AdminStatusPanel
                                        variant="error"
                                        title={activityError?.title || tx("Activity feed unavailable")}
                                        description={activityError?.message || tx("Try again to load the activity feed.")}
                                        onRetry={() => syncActivityFeed(false)}
                                        retryLabel={tx("Retry activity feed")}
                                    />
                                ) : activityStatus === "loading" && activities.length === 0 ? (
                                    <AdminStatusPanel variant="loading" title={tx("Loading activity feed")} description={tx("Fetching the latest store events.")} />
                                ) : (
                                    <>
                                        {activityStatus === "error" ? (
                                            <AdminStatusPanel
                                                variant="error"
                                                title={tx("Activity refresh failed")}
                                                description={activityError?.message || tx("Try again to refresh the activity feed.")}
                                                onRetry={() => syncActivityFeed(false)}
                                                retryLabel={tx("Retry activity feed")}
                                            />
                                        ) : null}
                                        {activities.length > 0 ? (
                                            activities.slice(0, 8).map((activity) => (
                                                <Link
                                                    key={activity.id}
                                                    to={activity.route}
                                                    className={`admin__layout__main__header__notifications__item admin__layout__main__header__notifications__item--${activity.type}${activity.unread ? " is-unread" : " is-read"}`}
                                                    aria-label={`${activity.title}: ${activity.actionLabel}`}
                                                    onClick={() => {
                                                        markActivityRead(activity);
                                                        closeNotifications();
                                                    }}
                                                >
                                                    <div className="admin__layout__main__header__notifications__item-body">
                                                        <span
                                                            className="admin__layout__main__header__notifications__item-status"
                                                            aria-hidden="true"
                                                        />
                                                        <div>
                                                            <strong>{activity.title}</strong>
                                                            <p>{activity.description}</p>
                                                        </div>
                                                    </div>
                                                    <div className="admin__layout__main__header__notifications__item-meta">
                                                        <span>{formatUtcDateTime(activity.createdAt)}</span>
                                                        <span className="admin__layout__main__header__notifications__item-action">
                                                            {activity.actionLabel} <span aria-hidden="true">→</span>
                                                        </span>
                                                    </div>
                                                </Link>
                                            ))
                                        ) : (
                                            <p className="admin__layout__main__header__notifications__empty">
                                                No new notifications right now.
                                            </p>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="admin__layout__main__header__profile" aria-label={tx("Admin profile")}>
                    <div className="admin__layout__main__header__profile-avatar">{initials}</div>
                    <div className="admin__layout__main__header__profile-copy">
                        <strong>{loading ? tx("Loading...") : displayName || tx("Admin")}</strong>
                        <span>{userData?.role === "Admin" ? tx("Administrator") : tx("Team member")}</span>
                    </div>
                </div>

                <button
                    type="button"
                    className="admin__layout__main__header__logout"
                    aria-label={tx("Log out")}
                    onClick={() => setShowLogout(true)}
                >
                    <span>{tx("Logout")}</span>
                    <BoxArrowRightIcon size={20} />
                </button>
            </div>

            <Modal show={showLogout} onHide={() => setShowLogout(false)} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>{tx("Logout")}</Modal.Title>
                </Modal.Header>
                <Modal.Body>{tx("Are you sure you want to logout?")}</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowLogout(false)}>
                        {tx("Cancel")}
                    </Button>
                    <Button variant="primary" onClick={handleLogout}>
                        {tx("Logout")}
                    </Button>
                </Modal.Footer>
            </Modal>
        </header>
    );
};

export default AdminHeader;
