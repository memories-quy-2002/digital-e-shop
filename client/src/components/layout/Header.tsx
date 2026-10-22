import React, { JSX, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoxSeamIcon, CartIcon, BellIcon, CheckCircleIcon, PersonIcon, SearchIcon } from "../common/Icons";
import ColorSchemeDropdown from "../common/ColorSchemeDropdown";
import LanguageDropdown from "../common/LanguageDropdown";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { Role } from "../../types/user";
import "../../styles/layout/_header.scss";
import { useToast } from "../../context/ToastContext";
import { fetchCustomerNotifications, logoutCurrentCustomer } from "../../features/users/api";
import type { CustomerNotification } from "../../features/users/api";
import { signOutFirebaseUser } from "../../services/firebase";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useLocale } from "../../context/LocaleContext";
import { useT } from "../../hooks/useT";
import { getApiSuccessMessage } from "../../lib/api-contract";
import { CUSTOMER_ROUTES } from "../../routes/customerRoutes";

const MiniCartDrawer = lazy(() => import("../common/MiniCartDrawer"));
const HeaderMobileSheet = lazy(() => import("./HeaderMobileSheet"));
const loadHeaderContent = () => import("./HeaderDeferredContent");
const HeaderMobileContent = lazy(() =>
    loadHeaderContent().then(({ HeaderMobileContent: MobileContent }) => ({ default: MobileContent })),
);
const HeaderAccountMenus = lazy(() =>
    loadHeaderContent().then(({ HeaderAccountMenus: AccountMenus }) => ({ default: AccountMenus })),
);
const HeaderSearchPanel = lazy(() =>
    loadHeaderContent().then(({ HeaderSearchPanel: SearchPanel }) => ({ default: SearchPanel })),
);

const RECENT_SEARCH_KEY = "digital-e:recent-searches:v1";
const MAX_RECENT_SEARCHES = 5;
const CUSTOMER_NOTIFICATIONS_TARGET = CUSTOMER_ROUTES.notifications;

const primaryLinks = [
    { label: "Home", to: "/" },
    { label: "Shop", to: "/shops" },
    { label: "About", to: "/about-us" },
    { label: "News", to: "/news" },
    { label: "Support", to: "/support" },
    { label: "Contact", to: "/contact-us" },
];

export const Header = (): JSX.Element => {
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    useLocale();
    const t = useT();
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [hasOpenedMenu, setHasOpenedMenu] = useState(false);
    const [shouldFocusMobileSearch, setShouldFocusMobileSearch] = useState(false);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
    const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
    const [isNotificationMenuOpen, setIsNotificationMenuOpen] = useState(false);
    const { items: cartItems } = useCart();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const [isCartPreviewOpen, setIsCartPreviewOpen] = useState(false);
    const [hasOpenedCartPreview, setHasOpenedCartPreview] = useState(false);
    const { userData, loading, setUserData } = useAuth();
    const desktopSearchId = "header_search";
    const mobileMenuId = "header-mobile-menu";
    const [recentSearches, setRecentSearches] = useLocalStorage<string[]>(RECENT_SEARCH_KEY, []);
    const normalizedSearchTerm = searchTerm.trim();
    const shouldShowSearchPanel = isSearchOpen && (
        normalizedSearchTerm.length > 1 ||
        (normalizedSearchTerm.length === 0 && recentSearches.length > 0)
    );
    const searchRef = useRef<HTMLDivElement | null>(null);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const notificationMenuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

    const activePath = useMemo(() => location.pathname, [location.pathname]);
    const accountDisplayName = useMemo(() => {
        if (!userData) return t("common.account");

        const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(" ").trim();
        return fullName || userData.username || userData.email || t("common.account");
    }, [userData, t]);
    const isAdmin = Boolean(userData && !loading && userData.role === Role.Admin);

    const submitSearch = useCallback(
        (term?: string) => {
            const value = (term ?? searchTerm).trim();
            if (!value) {
                addToast(t("header.brand"), t("header.searchEmpty"));
                return;
            }

            setRecentSearches((previous) => {
                const filtered = previous.filter((entry) => entry.toLowerCase() !== value.toLowerCase());
                return [value, ...filtered].slice(0, MAX_RECENT_SEARCHES);
            });

            navigate(`/shops?term=${encodeURIComponent(value)}`);
            setIsSearchOpen(false);
            setIsMenuOpen(false);
        },
        [addToast, navigate, searchTerm, setRecentSearches, t],
    );

    useKeyboardShortcut(
        "/",
        () => {
            if (window.matchMedia("(max-width: 780px)").matches) {
                setHasOpenedMenu(true);
                setIsMenuOpen(true);
                setShouldFocusMobileSearch(true);
                return;
            }
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
            setIsSearchOpen(true);
        },
        { ignoreInputs: true, preventDefault: true },
    );

    const handleLogout = async () => {
        try {
            const response = await logoutCurrentCustomer();
            await signOutFirebaseUser();
            setUserData(null);
            addToast(t("common.logout"), getApiSuccessMessage(response, "Logged out"));
            navigate("/");
        } catch {
            addToast(t("common.logout"), t("header.tryAgain"));
            setUserData(null);
        }
    };

    const handleRequireLogin = (place: string) => {
        if (loading) {
            addToast(t("header.checkingLogin"), t("header.pleaseWait"));
            return;
        }

        if (userData) {
            navigate(place);
        } else {
            addToast(t("header.loginRequired"), t("header.loginRequiredBody"));
        }
    };

    const handleNotificationsPageNavigation = () => {
        if (loading) {
            addToast(t("header.checkingLogin"), t("header.pleaseWait"));
            return;
        }

        setIsNotificationMenuOpen(false);
        navigate(userData
            ? CUSTOMER_NOTIFICATIONS_TARGET
            : `/login?redirect=${encodeURIComponent(CUSTOMER_NOTIFICATIONS_TARGET)}`);
    };

    const handleNotificationToggle = () => {
        if (loading) {
            addToast(t("header.checkingLogin"), t("header.pleaseWait"));
            return;
        }

        if (!userData) {
            navigate(`/login?redirect=${encodeURIComponent(CUSTOMER_NOTIFICATIONS_TARGET)}`);
            return;
        }

        setIsNotificationMenuOpen((previous) => !previous);
    };

    const handleAccountAction = () => {
        if (loading) {
            addToast(t("header.checkingLogin"), t("header.pleaseWait"));
            return;
        }

        if (userData) {
            navigate("/account");
            return;
        }

        navigate("/login");
    };

    const handleAdminNavigation = () => {
        navigate("/admin");
        setIsProfileMenuOpen(false);
        setIsMenuOpen(false);
    };

    const handleCartNavigation = () => navigate("/cart");

    const closeMenu = () => setIsMenuOpen(false);

    useEffect(() => {
        let isActive = true;
        let isFetchInProgress = false;
        const customerId = userData?.role === Role.Customer ? userData.id : undefined;

        const fetchNotifications = async (isInitialLoad = false) => {
            if (!customerId) return;
            if (isFetchInProgress) return;
            isFetchInProgress = true;
            if (isInitialLoad) setIsNotificationsLoading(true);

            try {
                const response = await fetchCustomerNotifications(customerId, 10);
                if (!isActive) return;
                setUnreadNotifications(response.unread);
                setNotifications(response.notifications);
            } catch {
                // Preserve the last successful result when a background poll fails.
                if (isActive && isInitialLoad) {
                    setUnreadNotifications(0);
                    setNotifications([]);
                }
            } finally {
                isFetchInProgress = false;
                if (isActive && isInitialLoad) setIsNotificationsLoading(false);
            }
        };

        if (!customerId) {
            setUnreadNotifications(0);
            setNotifications([]);
            setIsNotificationsLoading(false);
            setIsNotificationMenuOpen(false);
            return () => {
                isActive = false;
            };
        }

        void fetchNotifications(true);

        const pollInterval = window.setInterval(() => {
            if (document.visibilityState === "visible") void fetchNotifications();
        }, 60_000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") void fetchNotifications();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            isActive = false;
            window.clearInterval(pollInterval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [userData?.id, userData?.role]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!searchRef.current?.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }

            if (!profileMenuRef.current?.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }

            if (!notificationMenuRef.current?.contains(event.target as Node)) {
                setIsNotificationMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsSearchOpen(false);
                setIsProfileMenuOpen(false);
                setIsNotificationMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("keydown", handleEscape);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    useEffect(() => {
        setIsSearchOpen(false);
        setIsProfileMenuOpen(false);
        setIsNotificationMenuOpen(false);
    }, [location.pathname, location.search]);

    return (
        <header className="header">
            <div className="header__signalbar">
                <div className="header__signalbar__inner">
                    <span className="header__signalbar__message">
                        <span className="header__signalbar__pulse" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                        </span>
                        {t("header.tagline")}
                    </span>
                    <div className="header__signalbar__items">
                        <span className="header__signalbar__item">
                            <CheckCircleIcon size={14} />
                            {t("cart.payos")}
                        </span>
                        <span className="header__signalbar__item">
                            <BoxSeamIcon size={14} />
                            {t("footer.cashOnDelivery")}
                        </span>
                    </div>
                </div>
            </div>
            <div className="header__shell">
                <div className="header__main">
                    <div className="header__brand">
                        <Link to="/" className="header__brand__logo">
                            <span className="header__brand__mark" aria-hidden="true">
                                <span className="header__brand__mark-core">D</span>
                                <span className="header__brand__mark-dot" />
                            </span>
                            <span className="header__brand__wordmark">
                                <strong translate="no">{t("header.brand")}</strong>
                                <small>{t("header.tagline")}</small>
                            </span>
                        </Link>
                    </div>

                    <nav className="header__nav" aria-label={t("header.primaryNavigation")}>
                        {primaryLinks.map((link) => (
                            <Link key={link.to} to={link.to} className={activePath === link.to ? "is-active" : ""}>
                                {t(`header.nav.${link.label.toLowerCase()}`)}
                            </Link>
                        ))}
                    </nav>

                    <div className="header__search" role="search" ref={searchRef}>
                        <label className="header__sr-only" htmlFor={desktopSearchId}>
                            {t("common.search")}
                        </label>
                        <SearchIcon size={18} className="header__search__icon" />
                        <input
                            ref={searchInputRef}
                            type="text"
                            name="header_search"
                            id={desktopSearchId}
                            placeholder={t("header.searchPlaceholder")}
                            className="header__search__bar"
                            value={searchTerm}
                            onFocus={() => {
                                if (
                                    searchTerm.trim().length > 1 ||
                                    (recentSearches.length > 0 && searchTerm.trim().length === 0)
                                ) {
                                    setIsSearchOpen(true);
                                }
                            }}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                setSearchTerm(nextValue);
                                setIsSearchOpen(true);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    submitSearch();
                                }

                                if (e.key === "Escape") {
                                    setIsSearchOpen(false);
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="header__search__submit"
                            onClick={() => submitSearch()}
                            aria-label={t("common.search")}
                        >
                            <SearchIcon size={18} />
                        </button>
                        {shouldShowSearchPanel ? (
                            <Suspense fallback={null}>
                                <HeaderSearchPanel
                                    searchTerm={searchTerm}
                                    recentSearches={recentSearches}
                                    onClearRecent={() => setRecentSearches([])}
                                    onSubmitSearch={(term) => {
                                        setSearchTerm(term);
                                        submitSearch(term);
                                    }}
                                    onSelectProduct={(product) => {
                                        navigate(`/product?id=${product.id}`);
                                        setIsSearchOpen(false);
                                    }}
                                    t={t}
                                />
                            </Suspense>
                        ) : null}
                    </div>

                    <div className="header__actions" aria-label={t("header.quickAccountActions")}>
                        <button
                            type="button"
                            className="header__action header__action--badge"
                            onClick={() => {
                                setHasOpenedCartPreview(true);
                                setIsCartPreviewOpen(true);
                            }}
                            aria-label={t("cart.openPreview")}
                            aria-haspopup="dialog"
                            aria-expanded={isCartPreviewOpen}
                            aria-controls="mini-cart-drawer"
                        >
                            <CartIcon size={20} />
                            {cartItems.length > 0 ? <span>{Math.min(cartItems.length, 99)}</span> : null}
                        </button>
                        {hasOpenedCartPreview ? (
                            <Suspense fallback={null}>
                                <MiniCartDrawer open={isCartPreviewOpen} onOpenChange={setIsCartPreviewOpen} />
                            </Suspense>
                        ) : null}
                        <div className="header__notifications" ref={notificationMenuRef}>
                            <button
                                type="button"
                                className={`header__action header__action--badge${isNotificationMenuOpen ? " is-open" : ""}`}
                                onClick={handleNotificationToggle}
                                aria-label={t("common.notifications")}
                                aria-expanded={isNotificationMenuOpen}
                                aria-controls="header-notifications-menu"
                            >
                                <BellIcon size={20} />
                                {unreadNotifications > 0 ? <span>{Math.min(unreadNotifications, 9)}</span> : null}
                            </button>
                            {isNotificationMenuOpen ? (
                                <Suspense fallback={null}>
                                    <HeaderAccountMenus
                                        isNotificationMenuOpen
                                        isProfileMenuOpen={false}
                                        isNotificationsLoading={isNotificationsLoading}
                                        notifications={notifications}
                                        unreadNotifications={unreadNotifications}
                                        hasUserData={Boolean(userData)}
                                        isAuthenticated={Boolean(userData && !loading)}
                                        isAdmin={isAdmin}
                                        t={t}
                                        onCloseNotifications={() => setIsNotificationMenuOpen(false)}
                                        onCloseProfile={() => setIsProfileMenuOpen(false)}
                                        onAdminNavigation={handleAdminNavigation}
                                        onAccountAction={handleAccountAction}
                                        onRequireLogin={handleRequireLogin}
                                        onCartNavigation={handleCartNavigation}
                                        onLogout={handleLogout}
                                    />
                                </Suspense>
                            ) : null}
                        </div>
                        <LanguageDropdown />
                        <ColorSchemeDropdown />
                        <div className="header__profile" ref={profileMenuRef}>
                            <button
                                type="button"
                                className={`header__action header__profile__trigger${isProfileMenuOpen ? " is-open" : ""}`}
                                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                                aria-label={t("header.openProfileMenu")}
                                aria-expanded={isProfileMenuOpen}
                            >
                                <PersonIcon size={20} />
                                {userData && !loading ? (
                                    <span className="header__profile__name">{accountDisplayName}</span>
                                ) : null}
                            </button>

                            {isProfileMenuOpen ? (
                                <Suspense fallback={null}>
                                    <HeaderAccountMenus
                                        isNotificationMenuOpen={false}
                                        isProfileMenuOpen
                                        isNotificationsLoading={isNotificationsLoading}
                                        notifications={notifications}
                                        unreadNotifications={unreadNotifications}
                                        hasUserData={Boolean(userData)}
                                        isAuthenticated={Boolean(userData && !loading)}
                                        isAdmin={isAdmin}
                                        t={t}
                                        onCloseNotifications={() => setIsNotificationMenuOpen(false)}
                                        onCloseProfile={() => setIsProfileMenuOpen(false)}
                                        onAdminNavigation={handleAdminNavigation}
                                        onAccountAction={handleAccountAction}
                                        onRequireLogin={handleRequireLogin}
                                        onCartNavigation={handleCartNavigation}
                                        onLogout={handleLogout}
                                    />
                                </Suspense>
                            ) : null}
                        </div>
                        <button
                            className="header__burger"
                            type="button"
                            onClick={() => {
                                setHasOpenedMenu(true);
                                setIsMenuOpen((prev) => !prev);
                            }}
                            aria-label={t("header.toggleMenu")}
                            aria-expanded={isMenuOpen}
                            aria-controls={mobileMenuId}
                        >
                            <span />
                            <span />
                            <span />
                        </button>
                    </div>
                </div>
            </div>

            {hasOpenedMenu ? (
                <Suspense fallback={null}>
                    <HeaderMobileSheet open={isMenuOpen} onOpenChange={setIsMenuOpen} id={mobileMenuId} closeLabel={t("header.closeMenu")}>
                        <Suspense fallback={null}>
                            <HeaderMobileContent
                                links={primaryLinks}
                                searchInputRef={mobileSearchInputRef}
                                searchTerm={searchTerm}
                                focusSearchOnMount={shouldFocusMobileSearch}
                                isAdmin={isAdmin}
                                isAuthenticated={Boolean(userData && !loading)}
                                cartItemCount={cartItems.length}
                                t={t}
                                onSearchTermChange={setSearchTerm}
                                onMobileSearchFocused={() => setShouldFocusMobileSearch(false)}
                                onSubmitSearch={() => submitSearch()}
                                onClose={closeMenu}
                                onAdminNavigation={handleAdminNavigation}
                                onAccountAction={handleAccountAction}
                                onRequireLogin={handleRequireLogin}
                                onNotificationsNavigation={handleNotificationsPageNavigation}
                                onCartNavigation={handleCartNavigation}
                                onLogout={handleLogout}
                            />
                        </Suspense>
                    </HeaderMobileSheet>
                </Suspense>
            ) : null}
        </header>
    );
};
