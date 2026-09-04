import React, { JSX, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CartIcon, BellIcon, HeartIcon, PersonIcon, SearchIcon } from "../common/Icons";
import ColorSchemeDropdown from "../common/ColorSchemeDropdown";
import LanguageDropdown from "../common/LanguageDropdown";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import "../../styles/layout/_header.scss";
import { useToast } from "../../context/ToastContext";
import axios from "../../api/axios";
import { fetchCustomerNotifications } from "../../features/users/api";
import { signOutFirebaseUser } from "../../services/firebase";
import { Product } from "../../utils/interface";
import { Sheet, SheetContent } from "../ui/sheet";
import { useKeyboardShortcut } from "../../hooks/useKeyboardShortcut";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { getProductImageUrl, normalizeProductImageName } from "../../utils/images";
import { useLocale } from "../../context/LocaleContext";
import { useT } from "../../hooks/useT";

const RECENT_SEARCH_KEY = "digital-e:recent-searches:v1";
const MAX_RECENT_SEARCHES = 5;

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
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const { items: cartItems } = useCart();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const { userData, loading, setUserData } = useAuth();
    const desktopSearchId = "header_search";
    const mobileSearchId = "header_mobile_search";
    const mobileMenuId = "header-mobile-menu";
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const [recentSearches, setRecentSearches] = useLocalStorage<string[]>(RECENT_SEARCH_KEY, []);

    const activePath = useMemo(() => location.pathname, [location.pathname]);
    const normalizedDeferredSearchTerm = deferredSearchTerm.trim();
    const shouldShowSearchResults = isSearchOpen && normalizedDeferredSearchTerm.length > 1;
    const hasSearchResults = shouldShowSearchResults && searchResults.length > 0;
    const shouldShowRecent = isSearchOpen && normalizedDeferredSearchTerm.length < 2 && recentSearches.length > 0;
    const accountDisplayName = useMemo(() => {
        if (!userData) return t("common.account");

        const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(" ").trim();
        return fullName || userData.username || userData.email || t("common.account");
    }, [userData, t]);

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
            setSearchResults([]);
            setIsSearchOpen(false);
            setIsMenuOpen(false);
        },
        [addToast, navigate, searchTerm, setRecentSearches, t],
    );

    useKeyboardShortcut(
        "/",
        () => {
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
            setIsSearchOpen(true);
        },
        { ignoreInputs: true, preventDefault: true },
    );

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            if (response.status === 200) {
                await signOutFirebaseUser();
                setUserData(null);
                addToast(t("common.logout"), response.data.msg);
                navigate("/");
            }
        } catch {
            addToast(t("common.logout"), "Please try again.");
            setUserData(null);
        }
    };

    const handleRequireLogin = (place: string) => {
        if (loading) {
            addToast("Checking login", "Please wait a moment and try again.");
            return;
        }

        if (userData) {
            navigate(place);
        } else {
            addToast("Login required", "You need to login to use this feature");
        }
    };

    const handleAccountAction = () => {
        if (loading) {
            addToast("Checking login", "Please wait a moment and try again.");
            return;
        }

        if (userData) {
            navigate("/account");
            return;
        }

        navigate("/login");
    };

    const closeMenu = () => setIsMenuOpen(false);

    useEffect(() => {
        const fetchNotifications = async () => {
            if (!userData?.id) {
                setUnreadNotifications(0);
                return;
            }

            try {
                const response = await fetchCustomerNotifications(userData.id, 10);
                setUnreadNotifications(response.unread);
            } catch {
                setUnreadNotifications(0);
            }
        };

        fetchNotifications();
    }, [userData?.id]);

    useEffect(() => {
        const normalizedTerm = normalizedDeferredSearchTerm.toLowerCase();

        if (normalizedTerm.length < 2) {
            setSearchResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = window.setTimeout(() => {
            axios
                .get(`/api/products/search?q=${encodeURIComponent(normalizedTerm)}&limit=6`)
                .then((response) => {
                    if (response.status === 200) {
                        setSearchResults(response.data.products || []);
                    } else {
                        setSearchResults([]);
                    }
                })
                .catch(() => {
                    setSearchResults([]);
                })
                .finally(() => setIsSearching(false));
        }, 220);

        return () => window.clearTimeout(timer);
    }, [normalizedDeferredSearchTerm]);

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (!searchRef.current?.contains(event.target as Node)) {
                setIsSearchOpen(false);
            }

            if (!profileMenuRef.current?.contains(event.target as Node)) {
                setIsProfileMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setIsSearchOpen(false);
                setIsProfileMenuOpen(false);
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
    }, [location.pathname, location.search]);

    return (
        <header className="header">
            <div className="header__shell">
                <div className="header__main">
                    <div className="header__brand">
                        <Link to="/" className="header__brand__logo">
                            <span className="header__brand__mark" aria-hidden="true">
                                <span className="header__brand__mark-core">D</span>
                                <span className="header__brand__mark-dot" />
                            </span>
                            <span className="header__brand__wordmark">
                                <strong>{t("header.brand")}</strong>
                                <small>{t("header.tagline")}</small>
                            </span>
                        </Link>
                    </div>

                    <nav className="header__nav" aria-label="Primary navigation">
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
                        {shouldShowSearchResults ? (
                            <div className="header__search__results">
                                {hasSearchResults ? (
                                    searchResults.map((product) => {
                                        const hasSale =
                                            product.sale_price !== null &&
                                            product.sale_price !== undefined &&
                                            product.sale_price < product.price;
                                        const activePrice = hasSale ? product.sale_price : product.price;
                                        return (
                                            <button
                                                key={product.id}
                                                type="button"
                                                className="header__search__result"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                    navigate(`/product?id=${product.id}`);
                                                    setSearchResults([]);
                                                    setIsSearchOpen(false);
                                                }}
                                            >
                                                <span className="header__search__result__image">
                                                    <img
                                                        src={getProductImageUrl(
                                                            normalizeProductImageName(product.main_image),
                                                        )}
                                                        alt=""
                                                        loading="lazy"
                                                    />
                                                </span>
                                                <span className="header__search__result__body">
                                                    <span className="header__search__result__top">
                                                        <strong>{product.name}</strong>
                                                        {hasSale ? (
                                                            <span className="header__search__result__badge">Sale</span>
                                                        ) : null}
                                                    </span>
                                                    <span>
                                                        {product.brand} - {product.category}
                                                    </span>
                                                </span>
                                                <span className="header__search__result__price">
                                                    ${Number(activePrice || 0).toFixed(2)}
                                                </span>
                                            </button>
                                        );
                                    })
                                ) : isSearching ? (
                                    <div className="header__search__empty">Searching…</div>
                                ) : (
                                    <div className="header__search__empty">{t("header.searchNoResults")}</div>
                                )}
                                <div className="header__search__shortcut">{t("header.searchShortcutHint")}</div>
                            </div>
                        ) : shouldShowRecent ? (
                            <div className="header__search__results">
                                <div className="header__search__history">
                                    <span>Recent searches</span>
                                    <button
                                        type="button"
                                        className="header__search__history-clear"
                                        onClick={() => setRecentSearches([])}
                                    >
                                        Clear
                                    </button>
                                </div>
                                <div style={{ padding: "0.5rem 0.6rem" }}>
                                    {recentSearches.map((entry) => (
                                        <button
                                            key={entry}
                                            type="button"
                                            className="header__search__history-chip"
                                            onClick={() => {
                                                setSearchTerm(entry);
                                                submitSearch(entry);
                                            }}
                                        >
                                            {entry}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="header__actions" aria-label="Quick account actions">
                        <button
                            type="button"
                            className="header__action header__action--badge"
                            onClick={() => handleRequireLogin("/cart")}
                            aria-label={t("common.cart")}
                        >
                            <CartIcon size={20} />
                            {cartItems.length > 0 ? <span>{Math.min(cartItems.length, 99)}</span> : null}
                        </button>
                        <button
                            type="button"
                            className="header__action header__action--badge"
                            onClick={() => handleRequireLogin("/notifications")}
                            aria-label={t("common.notifications")}
                        >
                            <BellIcon size={20} />
                            {unreadNotifications > 0 ? <span>{Math.min(unreadNotifications, 9)}</span> : null}
                        </button>
                        <LanguageDropdown />
                        <ColorSchemeDropdown />
                        <div className="header__profile" ref={profileMenuRef}>
                            <button
                                type="button"
                                className={`header__action header__profile__trigger${isProfileMenuOpen ? " is-open" : ""}`}
                                onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                                aria-label="Open profile menu"
                                aria-expanded={isProfileMenuOpen}
                            >
                                <PersonIcon size={20} />
                                {userData && !loading ? (
                                    <span className="header__profile__name">{accountDisplayName}</span>
                                ) : null}
                            </button>

                            {isProfileMenuOpen ? (
                                <div className="header__profile__menu">
                                    <button
                                        type="button"
                                        className="header__profile__item"
                                        onClick={() => {
                                            handleAccountAction();
                                            setIsProfileMenuOpen(false);
                                        }}
                                    >
                                        <PersonIcon size={18} />
                                        <span>{userData ? t("common.account") : t("common.login")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="header__profile__item"
                                        onClick={() => {
                                            handleRequireLogin("/wishlist");
                                            setIsProfileMenuOpen(false);
                                        }}
                                    >
                                        <HeartIcon size={18} />
                                        <span>{t("common.wishlist")}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="header__profile__item"
                                        onClick={() => {
                                            handleRequireLogin("/cart");
                                            setIsProfileMenuOpen(false);
                                        }}
                                    >
                                        <CartIcon size={18} />
                                        <span>{t("common.cart")}</span>
                                    </button>
                                    {userData && !loading ? (
                                        <button
                                            type="button"
                                            className="header__profile__item header__profile__item--danger"
                                            onClick={() => {
                                                handleLogout();
                                                setIsProfileMenuOpen(false);
                                            }}
                                        >
                                            <span>{t("common.logout")}</span>
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                        <button
                            className="header__burger"
                            type="button"
                            onClick={() => setIsMenuOpen((prev) => !prev)}
                            aria-label="Toggle menu"
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

            <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <SheetContent side="right" className="header__mobile is-open" id={mobileMenuId}>
                <div className="header__mobile__search" role="search">
                    <label className="header__sr-only" htmlFor={mobileSearchId}>
                        {t("common.search")}
                    </label>
                    <input
                        type="text"
                        id={mobileSearchId}
                        placeholder={t("header.searchMobilePlaceholder")}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                submitSearch();
                                closeMenu();
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            submitSearch();
                            closeMenu();
                        }}
                    >
                        {t("common.search")}
                    </button>
                </div>

                <nav className="header__mobile__links" aria-label="Mobile navigation">
                    {primaryLinks.map((link) => (
                        <Link key={link.to} to={link.to} onClick={closeMenu}>
                            {t(`header.nav.${link.label.toLowerCase()}`)}
                        </Link>
                    ))}
                </nav>

                <div className="header__mobile__actions">
                    <button
                        type="button"
                        onClick={() => {
                            handleAccountAction();
                            closeMenu();
                        }}
                    >
                        <PersonIcon size={18} />
                        {userData && !loading ? t("common.account") : t("common.login")}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/wishlist");
                            closeMenu();
                        }}
                    >
                        <HeartIcon size={18} />
                        {t("common.wishlist")}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/notifications");
                            closeMenu();
                        }}
                    >
                        <BellIcon size={18} />
                        {t("common.notifications")}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/cart");
                            closeMenu();
                        }}
                    >
                        <CartIcon size={18} />
                        {t("common.cart")}
                        {cartItems.length > 0 ? ` (${cartItems.length})` : ""}
                    </button>
                    <LanguageDropdown />
                    <ColorSchemeDropdown />
                    {userData && !loading ? (
                        <button
                            type="button"
                            onClick={() => {
                                handleLogout();
                                closeMenu();
                            }}
                        >
                            {t("common.logout")}
                        </button>
                    ) : null}
                </div>
                </SheetContent>
            </Sheet>
        </header>
    );
};
