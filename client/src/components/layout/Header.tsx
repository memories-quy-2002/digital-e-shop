import React, { JSX, useState } from "react";
import { IoCall, IoCart, IoHeart, IoHome, IoMailSharp } from "react-icons/io5";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/Header.scss";
import { useToast } from "../../context/ToastContext";
import axios from "../../api/axios";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";

export const Header = (): JSX.Element => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { userData, loading, setUserData } = useAuth();

    const handleSearch = () => {
        if (!searchTerm.trim()) {
            addToast("Search empty", "Type something to search.");
            return;
        }
        navigate(`/shops?term=${searchTerm}`);
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
            console.error("Logout failed", err);
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

    return (
        <header className="header">
            <div className="header__top">
                <div className="header__top__contact">
                    <span className="header__top__contact__item">
                        <IoCall />
                        (+84) 123 456 7890
                    </span>
                    <span className="header__top__contact__item">
                        <IoMailSharp />
                        digital-e@gmail.com
                    </span>
                    <span className="header__top__contact__item">
                        <IoHome />
                        123 ABC Street, HCM City
                    </span>
                </div>
                <div className="header__top__auth">
                    <span className="header__top__welcome">
                        Welcome {userData && !loading ? userData.username : "Anonymous"}
                    </span>
                    <div className="header__top__links">
                        {userData && !loading ? (
                            <Link to="/" onClick={handleLogout}>
                                Logout
                            </Link>
                        ) : (
                            <>
                                <Link to="/login">Login</Link>
                                <span className="header__top__divider">/</span>
                                <Link to="/signup">Signup</Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="header__main">
                <div className="header__brand">
                    <Link to="/" className="header__brand__logo">
                        DIGITAL-E
                    </Link>
                    <span className="header__brand__tag">Smart tech marketplace</span>
                </div>
                <nav className="header__nav">
                    <Link to="/">Home</Link>
                    <Link to="/shops">Shop</Link>
                    <Link to="/about-us">About</Link>
                    <Link to="/news">News</Link>
                    <Link to="/support">Support</Link>
                    <Link to="/contact-us">Contact</Link>
                </nav>
                <div className="header__actions">
                    <div className="header__search">
                        <input
                            type="text"
                            name="header_search"
                            id="header_search"
                            placeholder="Search products, brands, categories"
                            className="header__search__bar"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    handleSearch();
                                }
                            }}
                        />
                        <button onClick={handleSearch}>Search</button>
                    </div>
                    <div className="header__quick">
                        <button
                            className="header__quick__item"
                            type="button"
                            onClick={() => handleRequireLogin("/wishlist")}
                        >
                            <IoHeart size={22} />
                            Wishlist
                        </button>
                        <button
                            className="header__quick__item"
                            type="button"
                            onClick={() => handleRequireLogin("/cart")}
                        >
                            <IoCart size={22} />
                            Cart
                        </button>
                    </div>
                    <button
                        className="header__burger"
                        type="button"
                        onClick={() => setIsMenuOpen((prev) => !prev)}
                        aria-label="Toggle menu"
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                </div>
            </div>
            <div className={`header__mobile ${isMenuOpen ? "is-open" : ""}`}>
                <div className="header__mobile__search">
                    <input
                        type="text"
                        placeholder="Search products, brands, categories"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                handleSearch();
                                setIsMenuOpen(false);
                            }
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            handleSearch();
                            setIsMenuOpen(false);
                        }}
                    >
                        Search
                    </button>
                </div>
                <div className="header__mobile__links">
                    <Link to="/" onClick={() => setIsMenuOpen(false)}>
                        Home
                    </Link>
                    <Link to="/shops" onClick={() => setIsMenuOpen(false)}>
                        Shop
                    </Link>
                    <Link to="/about-us" onClick={() => setIsMenuOpen(false)}>
                        About
                    </Link>
                    <Link to="/news" onClick={() => setIsMenuOpen(false)}>
                        News
                    </Link>
                    <Link to="/support" onClick={() => setIsMenuOpen(false)}>
                        Support
                    </Link>
                    <Link to="/contact-us" onClick={() => setIsMenuOpen(false)}>
                        Contact
                    </Link>
                </div>
                <div className="header__mobile__actions">
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/wishlist");
                            setIsMenuOpen(false);
                        }}
                    >
                        <IoHeart size={20} />
                        Wishlist
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            handleRequireLogin("/cart");
                            setIsMenuOpen(false);
                        }}
                    >
                        <IoCart size={20} />
                        Cart
                    </button>
                </div>
            </div>
        </header>
    );
};
