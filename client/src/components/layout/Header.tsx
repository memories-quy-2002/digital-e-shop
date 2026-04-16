import React, { JSX, useMemo, useState } from "react";
import {
    BoxSeamIcon,
    CartIcon,
    EnvelopeIcon,
    HeartIcon,
    HouseFillIcon,
    PersonIcon,
    SearchIcon,
    TelephoneIcon,
} from "../common/Icons";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/Header.scss";
import { useToast } from "../../context/ToastContext";
import axios from "../../api/axios";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";

const quickCategories = [
    {
        label: "Laptops",
        to: "/shops?categories=Laptop&brands=&minPrice=0&maxPrice=5000&term=",
    },
    {
        label: "Phones",
        to: "/shops?categories=Smartphone&brands=&minPrice=0&maxPrice=5000&term=",
    },
    {
        label: "Audio",
        to: "/shops?categories=Speaker&brands=&minPrice=0&maxPrice=5000&term=",
    },
    {
        label: "TVs",
        to: "/shops?categories=Television&brands=&minPrice=0&maxPrice=5000&term=",
    },
    {
        label: "Cameras",
        to: "/shops?categories=Camera&brands=&minPrice=0&maxPrice=5000&term=",
    },
    {
        label: "Components",
        to: "/shops?categories=Graphics+Card&brands=&minPrice=0&maxPrice=5000&term=",
    },
];

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
    const { userData, loading, setUserData } = useAuth();
    const desktopSearchId = "header_search";
    const mobileSearchId = "header_mobile_search";
    const mobileMenuId = "header-mobile-menu";

    const activePath = useMemo(() => location.pathname, [location.pathname]);

    const handleSearch = () => {
        if (!searchTerm.trim()) {
            addToast("Search empty", "Type something to search.");
            return;
        }

        navigate(`/shops?term=${encodeURIComponent(searchTerm.trim())}`);
    };

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            if (response.status === 200) {
                await signOut(auth);
                setUserData(null);
                addToast("Logout successfully", response.data.msg);
                navigate("/");
            }
        } catch (err) {
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
            addToast("Account", "Profile tools are coming soon.");
            return;
        }

        navigate("/login");
    };

    const closeMenu = () => setIsMenuOpen(false);

    return (
        <header className="header">
            <div className="header__promo">
                <div className="header__promo__inner">
                    <span>Fresh arrivals for creators, gamers, and smart-home setups.</span>
                    <Link to="/shops">Shop the latest gear</Link>
                </div>
            </div>

            <div className="header__utility">
                <div className="header__utility__inner">
                    <div className="header__utility__contact" aria-label="Store contact details">
                        <a href="tel:+841234567890">
                            <TelephoneIcon size={16} />
                            (+84) 123 456 7890
                        </a>
                        <a href="mailto:digital-e@gmail.com">
                            <EnvelopeIcon size={16} />
                            digital-e@gmail.com
                        </a>
                        <span>
                            <HouseFillIcon size={16} />
                            HCM City, Vietnam
                        </span>
                    </div>

                    <div className="header__utility__account">
                        <span className="header__utility__welcome">
                            {userData && !loading ? `Welcome back, ${userData.username}` : "Guest browsing mode"}
                        </span>
                        {userData && !loading ? (
                            <button type="button" onClick={handleLogout}>
                                Logout
                            </button>
                        ) : (
                            <div className="header__utility__authlinks">
                                <Link to="/login">Login</Link>
                                <Link to="/signup">Create account</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="header__shell">
                <div className="header__main">
                    <div className="header__brand">
                        <Link to="/" className="header__brand__logo">
                            <span className="header__brand__mark">DE</span>
                            <span className="header__brand__wordmark">
                                <strong>DIGITAL-E</strong>
                                <small>Tech marketplace for modern setups</small>
                            </span>
                        </Link>
                    </div>

                    <div className="header__search" role="search">
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
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSearch();
                                }
                            }}
                        />
                        <button type="button" onClick={handleSearch}>
                            Search
                        </button>
                    </div>

                    <div className="header__actions" aria-label="Quick account actions">
                        <button type="button" className="header__action" onClick={() => handleRequireLogin("/wishlist")}>
                            <HeartIcon size={20} />
                            <span>Wishlist</span>
                        </button>
                        <button type="button" className="header__action" onClick={() => handleRequireLogin("/cart")}>
                            <CartIcon size={20} />
                            <span>Cart</span>
                        </button>
                        <button type="button" className="header__action" onClick={handleAccountAction}>
                            <PersonIcon size={20} />
                            <span>Account</span>
                        </button>
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

                <div className="header__subnav">
                    <nav className="header__nav" aria-label="Primary navigation">
                        {primaryLinks.map((link) => (
                            <Link
                                key={link.to}
                                to={link.to}
                                className={activePath === link.to ? "is-active" : ""}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="header__benefits" aria-label="Store benefits">
                        <span>
                            <BoxSeamIcon size={16} />
                            Fast delivery
                        </span>
                        <span>Secure checkout</span>
                        <span>Trusted gear picks</span>
                    </div>
                </div>

                <div className="header__categories" aria-label="Popular shopping categories">
                    {quickCategories.map((category) => (
                        <Link key={category.label} to={category.to}>
                            {category.label}
                        </Link>
                    ))}
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
                            handleRequireLogin("/cart");
                            closeMenu();
                        }}
                    >
                        <CartIcon size={18} />
                        Cart
                    </button>
                </div>

                <div className="header__mobile__categories">
                    {quickCategories.map((category) => (
                        <Link key={category.label} to={category.to} onClick={closeMenu}>
                            {category.label}
                        </Link>
                    ))}
                </div>
            </div>
        </header>
    );
};
