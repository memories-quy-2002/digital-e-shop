import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "../ui/legacy";
import { BellIcon, BoxArrowRightIcon, HouseIcon, MenuIcon, SearchIcon } from "../common/Icons";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { signOutFirebaseUser } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatUtcDateTime } from "../../utils/dateTime";
import { fetchAdminAlerts, type AdminAlert } from "../../features/admin/api";
import AdminStatusPanel from "../../features/admin/components/AdminStatusPanel";
import { getAdminRequestError, type AdminRequestError } from "../../features/admin/utils/adminRequestError";
import {
    ADMIN_ALERT_READ_STATE_EVENT,
    applyAdminAlertReadState,
    getAdminAlertReadIds,
    saveAdminAlertReadIds,
} from "../../features/admin/utils/adminAlertState";

const cookies = new Cookies();
const POLL_INTERVAL = 60000;

const getDisplayName = (username?: string, firstName?: string | null, lastName?: string | null) => {
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    return fullName || username || "Admin";
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
                setActivities(applyAdminAlertReadState(alerts.slice(0, 8), getAdminAlertReadIds(userData?.id)));
                setActivityStatus("success");
            } catch (error) {
                setActivityError(getAdminRequestError(error));
                setActivityStatus("error");
                if (!isInitialLoad) {
                    addToast("Admin notifications", "Activity sync failed. Showing the latest saved feed.");
                }
            }
        },
        [addToast, userData?.id],
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

    useEffect(() => {
        const handleReadStateChange = () => {
            setActivities((currentActivities) => applyAdminAlertReadState(currentActivities, getAdminAlertReadIds(userData?.id)));
        };

        window.addEventListener(ADMIN_ALERT_READ_STATE_EVENT, handleReadStateChange);
        return () => window.removeEventListener(ADMIN_ALERT_READ_STATE_EVENT, handleReadStateChange);
    }, [userData?.id]);

    const unreadCount = activities.filter((activity) => activity.unread).length;

    const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const route = getSearchRoute(searchTerm);
        navigate(route);
        if (searchTerm.trim() && route === "/admin") {
            addToast("Admin navigation", "Choose Products, Orders, or Accounts from the section search.");
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

        const nextReadAlertIds = [...new Set([...getAdminAlertReadIds(userData?.id), activity.id])];
        saveAdminAlertReadIds(userData?.id, nextReadAlertIds);
        setActivities((currentActivities) => applyAdminAlertReadState(currentActivities, nextReadAlertIds));
    };

    const handleMarkAllRead = () => {
        const unreadIds = activities.filter((activity) => activity.unread).map((activity) => activity.id);
        if (unreadIds.length === 0) return;

        const nextReadAlertIds = [...new Set([...getAdminAlertReadIds(userData?.id), ...unreadIds])];
        saveAdminAlertReadIds(userData?.id, nextReadAlertIds);
        setActivities((currentActivities) => applyAdminAlertReadState(currentActivities, nextReadAlertIds));
        addToast(
            "Admin activity",
            `${unreadIds.length} alert${unreadIds.length === 1 ? "" : "s"} marked as read.`,
        );
    };

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            sessionStorage.removeItem("rememberMe");
            cookies.remove("rememberMe");
            await signOutFirebaseUser();
            addToast("Logout successfully", response.data?.msg || "Logged out");
        } catch {
            addToast("Logout", "You have been logged out.");
        } finally {
            navigate("/login");
        }
    };

    return (
        <header className="admin__layout__main__header">
            <Helmet>
                <title>Digital-E - Admin</title>
                <meta name="description" content="Admin Dashboard for Digital-E" />
            </Helmet>

            <div className="admin__layout__main__header__left">
                <button
                    type="button"
                    className="admin__layout__main__header__menu"
                    aria-label="Open admin navigation"
                    aria-controls="admin-navigation"
                    aria-expanded={isSidebarOpen}
                    onClick={onOpenSidebar}
                >
                    <MenuIcon size={21} />
                </button>
                <button
                    type="button"
                    className="admin__layout__main__header__home"
                    aria-label="Open storefront"
                    onClick={() => navigate("/")}
                >
                    <HouseIcon />
                    <span>Storefront</span>
                </button>

                <form className="admin__layout__main__header__search" onSubmit={handleSearchSubmit}>
                    <label className="admin__sr-only" htmlFor="admin-search">
                        Jump to an Admin section
                    </label>
                    <input
                        id="admin-search"
                        type="text"
                        placeholder="Jump to Products, Orders, or Accounts…"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <button type="submit" aria-label="Jump to Admin section">
                        <SearchIcon size={20} />
                    </button>
                </form>
            </div>

            <div className="admin__layout__main__header__right">
                <div className="admin__layout__main__header__notifications">
                    <button
                        type="button"
                        className="admin__layout__main__header__notifications__trigger"
                        onClick={toggleNotifications}
                        ref={notificationsTriggerRef}
                        aria-expanded={showNotifications}
                        aria-controls="admin-notifications-popover"
                        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
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
                                    <strong id="admin-notifications-title">Activity feed</strong>
                                    <span>Latest store events for admin review</span>
                                </div>
                                <div className="admin__layout__main__header__notifications__panel-actions">
                                    <button
                                        type="button"
                                        className="admin__layout__main__header__notifications__mark-all"
                                        onClick={handleMarkAllRead}
                                        disabled={unreadCount === 0 || activityStatus === "loading"}
                                    >
                                        Mark all as read
                                    </button>
                                    <button
                                        type="button"
                                        className="admin__layout__main__header__notifications__refresh"
                                        onClick={() => syncActivityFeed(false)}
                                    >
                                        Refresh
                                    </button>
                                </div>
                            </div>
                            <div className="admin__layout__main__header__notifications__list">
                                {activityStatus === "error" && activities.length === 0 ? (
                                    <AdminStatusPanel
                                        variant="error"
                                        title={activityError?.title || "Activity feed unavailable"}
                                        description={activityError?.message || "Try again to load the activity feed."}
                                        onRetry={() => syncActivityFeed(false)}
                                        retryLabel="Retry activity feed"
                                    />
                                ) : activityStatus === "loading" && activities.length === 0 ? (
                                    <AdminStatusPanel variant="loading" title="Loading activity feed" description="Fetching the latest store events." />
                                ) : (
                                    <>
                                        {activityStatus === "error" ? (
                                            <AdminStatusPanel
                                                variant="error"
                                                title="Activity refresh failed"
                                                description={activityError?.message || "Try again to refresh the activity feed."}
                                                onRetry={() => syncActivityFeed(false)}
                                                retryLabel="Retry activity feed"
                                            />
                                        ) : null}
                                        {activities.length > 0 ? (
                                            activities.map((activity) => (
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

                <div className="admin__layout__main__header__profile" aria-label="Admin profile">
                    <div className="admin__layout__main__header__profile-avatar">{initials}</div>
                    <div className="admin__layout__main__header__profile-copy">
                        <strong>{loading ? "Loading..." : displayName}</strong>
                        <span>{userData?.role === "Admin" ? "Administrator" : "Team member"}</span>
                    </div>
                </div>

                <button
                    type="button"
                    className="admin__layout__main__header__logout"
                    aria-label="Log out"
                    onClick={() => setShowLogout(true)}
                >
                    <span>Logout</span>
                    <BoxArrowRightIcon size={20} />
                </button>
            </div>

            <Modal show={showLogout} onHide={() => setShowLogout(false)} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Logout</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to logout?</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={() => setShowLogout(false)}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleLogout}>
                        Logout
                    </Button>
                </Modal.Footer>
            </Modal>
        </header>
    );
};

export default AdminHeader;
