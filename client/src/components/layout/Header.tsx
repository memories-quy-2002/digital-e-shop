import React, { JSX, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { CartIcon, BellIcon, HeartIcon, PersonIcon, SearchIcon } from "../common/Icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/layout/_header.scss";
import { useToast } from "../../context/ToastContext";
import axios from "../../api/axios";
import { fetchCustomerNotifications } from "../../features/users/api";
import { signOutFirebaseUser } from "../../services/firebase";
import { Product } from "../../utils/interface";

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
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [searchResults, setSearchResults] = useState<Product[]>([]);
    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
    const { userData, loading, setUserData } = useAuth();
    const desktopSearchId = "header_search";
    const mobileSearchId = "header_mobile_search";
    const mobileMenuId = "header-mobile-menu";
    // useDeferredValue keeps typing responsive while the filtered dropdown
    // catches up shortly after input changes.
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const searchRef = useRef<HTMLDivElement | null>(null);
    const profileMenuRef = useRef<HTMLDivElement | null>(null);

    const activePath = useMemo(() => location.pathname, [location.pathname]);
    const normalizedDeferredSearchTerm = deferredSearchTerm.trim();
    const shouldShowSearchResults = isSearchOpen && normalizedDeferredSearchTerm.length > 1;
    const hasSearchResults = shouldShowSearchResults && searchResults.length > 0;
    const accountDisplayName = useMemo(() => {
        if (!userData) return "Account";

        const fullName = [userData.first_name, userData.last_name].filter(Boolean).join(" ").trim();
        return fullName || userData.username || userData.email || "Account";
    }, [userData]);

    const handleSearch = () => {
        if (!searchTerm.trim()) {
            addToast("Search empty", "Type something to search.");
            return;
        }

        navigate(`/shops?term=${encodeURIComponent(searchTerm.trim())}`);
        setSearchResults([]);
        setIsSearchOpen(false);
        setIsMenuOpen(false);
    };

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            if (response.status === 200) {
                await signOutFirebaseUser();
                setUserData(null);
                addToast("Logout successfully", response.data.msg);
                navigate("/");
            }
        } catch {
            addToast("Logout failed", "Please try again.");
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
            return;
        }

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
                });
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
                                <strong>Digital-E</strong>
                                <small>electronics store</small>
                            </span>
                        </Link>
                    </div>

                    <nav className="header__nav" aria-label="Primary navigation">
                        {primaryLinks.map((link) => (
                            <Link key={link.to} to={link.to} className={activePath === link.to ? "is-active" : ""}>
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="header__search" role="search" ref={searchRef}>
                        <label className="header__sr-only" htmlFor={desktopSearchId}>
                            Search the shop
                        </label>
                        <SearchIcon size={18} className="header__search__icon" />
                        <input
                            type="text"
                            name="header_search"
                            id={desktopSearchId}
                            placeholder="Search laptops, phones, speakers, and more"
                            className="header__search__bar"
                            value={searchTerm}
                            onFocus={() => {
                                if (searchTerm.trim().length > 1) {
                                    setIsSearchOpen(true);
                                }
                            }}
                            onChange={(e) => {
                                const nextValue = e.target.value;
                                setSearchTerm(nextValue);
                                setIsSearchOpen(nextValue.trim().length > 1);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSearch();
                                }

                                if (e.key === "Escape") {
                                    setIsSearchOpen(false);
                                }
                            }}
                        />
                        <button
                            type="button"
                            className="header__search__submit"
                            onClick={handleSearch}
                            aria-label="Search products"
                        >
                            <SearchIcon size={18} />
                        </button>
                        {shouldShowSearchResults ? (
                            <div className="header__search__results">
                                {hasSearchResults ? (
                                    searchResults.map((product) => (
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
                                            <strong>{product.name}</strong>
                                            <span>
                                                {product.brand} - {product.category}
                                            </span>
                                        </button>
                                    ))
                                ) : (
                                    <div className="header__search__empty">No matching products yet.</div>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <div className="header__actions" aria-label="Quick account actions">
                        <button
                            type="button"
                            className="header__action header__action--badge"
                            onClick={() => handleRequireLogin("/notifications")}
                            aria-label="Open notifications"
                        >
                            <BellIcon size={20} />
                            {unreadNotifications > 0 ? <span>{Math.min(unreadNotifications, 9)}</span> : null}
                        </button>
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
                                        <span>{userData ? "My account" : "Login"}</span>
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
                                        <span>Wishlist</span>
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
                                        <span>Cart</span>
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
                                            <span>Logout</span>
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

            <div className={`header__mobile ${isMenuOpen ? "is-open" : ""}`} id={mobileMenuId}>
                <div className="header__mobile__search" role="search">
                    <label className="header__sr-only" htmlFor={mobileSearchId}>
                        Search the shop from the mobile menu
                    </label>
                    <input
                        type="text"
                        id={mobileSearchId}
                        placeholder="Search products"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleSearch();
                                closeMenu();
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            handleSearch();
                            closeMenu();
                        }}
                    >
                        Search
                    </button>
                </div>

                <nav className="header__mobile__links" aria-label="Mobile navigation">
                    {primaryLinks.map((link) => (
                        <Link key={link.to} to={link.to} onClick={closeMenu}>
                            {link.label}
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
                        {userData && !loading ? "My account" : "Login"}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/wishlist");
                            closeMenu();
                        }}
                    >
                        <HeartIcon size={18} />
                        Wishlist
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/notifications");
                            closeMenu();
                        }}
                    >
                        <BellIcon size={18} />
                        Notifications
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/cart");
                            closeMenu();
                        }}
                    >
                        <CartIcon size={18} />
                        Cart
                    </button>
                    {userData && !loading ? (
                        <button
                            type="button"
                            onClick={() => {
                                handleLogout();
                                closeMenu();
                            }}
                        >
                            Logout
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                navigate("/login");
                                closeMenu();
                            }}
                        >
                            <PersonIcon size={18} />
                            Login
                        </button>
                    )}
                </div>
            </div>
        </header>
    );
};
