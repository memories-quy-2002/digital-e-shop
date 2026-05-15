import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { BellIcon, BoxArrowRightIcon, HouseIcon, SearchIcon } from "../common/Icons";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import { Helmet } from "react-helmet";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../../services/firebase";
import { useAuth } from "../../context/AuthContext";
import { formatUtcDateTime } from "../../utils/dateTime";

const cookies = new Cookies();
const POLL_INTERVAL = 60000;
const LOW_STOCK_THRESHOLD = 5;

type ActivityType = "order" | "user" | "inventory" | "payment";

type AdminActivity = {
    id: string;
    title: string;
    description: string;
    createdAt: string;
    type: ActivityType;
    unread: boolean;
};

type RecentOrder = {
    id: number;
    date_added: string | Date;
    total_price: number;
    status: number;
    payment_method?: "bank_transfer" | "cash";
};

type RecentUser = {
    id: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    created_at: string | Date;
};

type RecentProduct = {
    id: number;
    name: string;
    stock: number;
};

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(value || 0);

const formatActivityTime = (value: string | Date) => {
    if (value === "Inventory alert") {
        return "Just now";
    }
    return formatUtcDateTime(value);
};

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

const buildBaseActivities = (orders: RecentOrder[], users: RecentUser[], products: RecentProduct[]) => {
    const newestOrder = [...orders].sort((a, b) => new Date(b.date_added).getTime() - new Date(a.date_added).getTime())[0];
    const newestUser = [...users].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    const lowStockProducts = products
        .filter((product) => product.stock <= LOW_STOCK_THRESHOLD)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 2);
    const pendingTransfer = orders.filter((order) => order.payment_method === "bank_transfer" && order.status === 0)[0];

    const activities: AdminActivity[] = [];

    if (newestOrder) {
        activities.push({
            id: `order-${newestOrder.id}`,
            title: `Order #${newestOrder.id} received`,
            description: `A new order worth ${formatCurrency(newestOrder.total_price)} just came in.`,
            createdAt: formatActivityTime(newestOrder.date_added),
            type: "order",
            unread: false,
        });
    }

    if (newestUser) {
        activities.push({
            id: `user-${newestUser.id}`,
            title: `${getDisplayName(newestUser.username, newestUser.first_name, newestUser.last_name)} joined`,
            description: "A new account has been created and is ready for activity.",
            createdAt: formatActivityTime(newestUser.created_at),
            type: "user",
            unread: false,
        });
    }

    if (pendingTransfer) {
        activities.push({
            id: `payment-${pendingTransfer.id}`,
            title: `Order #${pendingTransfer.id} awaits bank transfer review`,
            description: "Check the transfer confirmation before marking the order as processed.",
            createdAt: formatActivityTime(pendingTransfer.date_added),
            type: "payment",
            unread: false,
        });
    }

    lowStockProducts.forEach((product) => {
        activities.push({
            id: `stock-${product.id}`,
            title: `${product.name} is running low`,
            description: `${product.stock} units left in inventory.`,
            createdAt: "Inventory alert",
            type: "inventory",
            unread: false,
        });
    });

    return activities.slice(0, 6);
};

const AdminHeader = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const { userData, loading } = useAuth();
    const [showLogout, setShowLogout] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [showNotifications, setShowNotifications] = useState(false);
    const [activities, setActivities] = useState<AdminActivity[]>([]);
    const previousNewestOrderIdRef = useRef<number | null>(null);
    const previousNewestUserIdRef = useRef<string | null>(null);
    const lowStockIdsRef = useRef<number[]>([]);

    const displayName = useMemo(
        () => getDisplayName(userData?.username, userData?.first_name, userData?.last_name),
        [userData?.first_name, userData?.last_name, userData?.username],
    );
    const initials = useMemo(() => getInitials(displayName), [displayName]);

    const syncActivityFeed = React.useCallback(
        async (isInitialLoad = false) => {
            try {
                const [orderResponse, userResponse, productResponse] = await Promise.all([
                    axios.get("/api/orders?page=1&limit=10"),
                    axios.get("/api/users?page=1&limit=10"),
                    axios.get("/api/products?page=1&limit=100"),
                ]);

                const orders = (orderResponse.data?.orders || []) as RecentOrder[];
                const users = (userResponse.data?.accounts || []) as RecentUser[];
                const products = (productResponse.data?.products || []) as RecentProduct[];

                const sortedOrders = [...orders].sort((a, b) => b.id - a.id);
                const sortedUsers = [...users].sort(
                    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                );
                const lowStockProducts = products.filter((product) => product.stock <= LOW_STOCK_THRESHOLD);
                const nextActivities = buildBaseActivities(sortedOrders, sortedUsers, products);

                setActivities((current) => {
                    const persistentUnread = current.filter((activity) => activity.unread);
                    const nextMap = new Map<string, AdminActivity>();

                    [...persistentUnread, ...nextActivities].forEach((activity) => {
                        nextMap.set(activity.id, activity);
                    });

                    return Array.from(nextMap.values()).slice(0, 8);
                });

                if (!isInitialLoad) {
                    const newestOrder = sortedOrders[0];
                    const newestUser = sortedUsers[0];
                    const nextLowStockIds = lowStockProducts.map((product) => product.id).sort((a, b) => a - b);
                    const previousLowStockIds = lowStockIdsRef.current;

                    if (newestOrder && previousNewestOrderIdRef.current && newestOrder.id > previousNewestOrderIdRef.current) {
                        const orderActivity: AdminActivity = {
                            id: `live-order-${newestOrder.id}`,
                            title: `New order #${newestOrder.id}`,
                            description: `A new order worth ${formatCurrency(newestOrder.total_price)} needs review.`,
                            createdAt: formatActivityTime(newestOrder.date_added),
                            type: "order",
                            unread: true,
                        };
                        setActivities((current) => [orderActivity, ...current].slice(0, 8));
                        addToast("Admin notification", `New order #${newestOrder.id} has arrived.`);
                    }

                    if (
                        newestUser &&
                        previousNewestUserIdRef.current &&
                        newestUser.id !== previousNewestUserIdRef.current
                    ) {
                        const userLabel = getDisplayName(newestUser.username, newestUser.first_name, newestUser.last_name);
                        const userActivity: AdminActivity = {
                            id: `live-user-${newestUser.id}`,
                            title: `${userLabel} created an account`,
                            description: "A new customer account has just been added to the store.",
                            createdAt: formatActivityTime(newestUser.created_at),
                            type: "user",
                            unread: true,
                        };
                        setActivities((current) => [userActivity, ...current].slice(0, 8));
                        addToast("Admin notification", `${userLabel} just joined the store.`);
                    }

                    const newLowStockProducts = lowStockProducts.filter(
                        (product) => !previousLowStockIds.includes(product.id),
                    );

                    if (newLowStockProducts.length > 0) {
                        const firstLowStock = newLowStockProducts[0];
                        const stockActivity: AdminActivity = {
                            id: `live-stock-${firstLowStock.id}`,
                            title: `${firstLowStock.name} needs restocking`,
                            description: `Only ${firstLowStock.stock} units remain in stock.`,
                            createdAt: "Inventory alert",
                            type: "inventory",
                            unread: true,
                        };
                        setActivities((current) => [stockActivity, ...current].slice(0, 8));
                        addToast("Admin notification", `${firstLowStock.name} is running low on stock.`);
                    }

                    lowStockIdsRef.current = nextLowStockIds;
                } else {
                    lowStockIdsRef.current = lowStockProducts.map((product) => product.id).sort((a, b) => a - b);
                }

                previousNewestOrderIdRef.current = sortedOrders[0]?.id ?? previousNewestOrderIdRef.current;
                previousNewestUserIdRef.current = sortedUsers[0]?.id ?? previousNewestUserIdRef.current;
            } catch {
                if (!isInitialLoad) {
                    addToast("Admin notifications", "Activity sync failed. Showing the latest saved feed.");
                }
            }
        },
        [addToast],
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
        navigate(getSearchRoute(searchTerm));
    };

    const toggleNotifications = () => {
        setShowNotifications((current) => {
            const nextValue = !current;
            if (!current) {
                setActivities((items) => items.map((item) => ({ ...item, unread: false })));
            }
            return nextValue;
        });
    };

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            sessionStorage.removeItem("rememberMe");
            cookies.remove("rememberMe");
            await signOut(auth);
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
                <button type="button" className="admin__layout__main__header__home" onClick={() => navigate("/")}>
                    <HouseIcon />
                    <span>Storefront</span>
                </button>

                <form className="admin__layout__main__header__search" onSubmit={handleSearchSubmit}>
                    <label className="admin__sr-only" htmlFor="admin-search">
                        Search admin sections
                    </label>
                    <input
                        id="admin-search"
                        type="text"
                        placeholder="Search products, orders, or users"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                    />
                    <button type="submit" aria-label="Search admin sections">
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
                        aria-expanded={showNotifications}
                        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
                    >
                        <BellIcon className="admin__layout__main__header__notifications__icon" size={24} />
                        {unreadCount > 0 && (
                            <span className="admin__layout__main__header__notifications__badge">{unreadCount}</span>
                        )}
                    </button>

                    {showNotifications && (
                        <div className="admin__layout__main__header__notifications__panel" role="dialog" aria-label="Admin notifications">
                            <div className="admin__layout__main__header__notifications__panel-header">
                                <div>
                                    <strong>Activity feed</strong>
                                    <span>Latest store events for admin review</span>
                                </div>
                                <button
                                    type="button"
                                    className="admin__layout__main__header__notifications__refresh"
                                    onClick={() => syncActivityFeed(false)}
                                >
                                    Refresh
                                </button>
                                <button
                                    type="button"
                                    className="admin__layout__main__header__notifications__refresh"
                                    onClick={() => {
                                        setShowNotifications(false);
                                        navigate("/admin/notifications");
                                    }}
                                >
                                    Open center
                                </button>
                            </div>
                            <div className="admin__layout__main__header__notifications__list">
                                {activities.length > 0 ? (
                                    activities.map((activity) => (
                                        <article
                                            key={activity.id}
                                            className={`admin__layout__main__header__notifications__item admin__layout__main__header__notifications__item--${activity.type}`}
                                        >
                                            <div>
                                                <strong>{activity.title}</strong>
                                                <p>{activity.description}</p>
                                            </div>
                                            <span>{activity.createdAt}</span>
                                        </article>
                                    ))
                                ) : (
                                    <p className="admin__layout__main__header__notifications__empty">
                                        No new notifications right now.
                                    </p>
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

                <button className="admin__layout__main__header__logout" onClick={() => setShowLogout(true)}>
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
