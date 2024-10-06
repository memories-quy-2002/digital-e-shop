import { useState } from "react";
import { Navbar } from "react-bootstrap";
import { IoCall, IoCart, IoHeart, IoHome, IoMailSharp } from "react-icons/io5";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "../../styles/Header.scss";
import { useToast } from "../../context/ToastContext";
import axios from "../../api/axios";
import Cookies from "universal-cookie";
import { signOut } from "firebase/auth";
import { auth } from "../../services/firebase";
const cookies = new Cookies();
export const Header = (): JSX.Element => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [searchTerm, setSearchTerm] = useState<string>("");
    const { uid, userData, loading } = useAuth();
    const handleSearch = () => {
        navigate(`/shops?term=${searchTerm}`);
    };

    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            if (response.status === 200) {
                sessionStorage.removeItem("rememberMe");
                cookies.remove("rememberMe");
                await signOut(auth);
                addToast("Logout successfully", response.data.msg);
                navigate("/");
            }
        } catch (err) {
            throw err;
        }
    };

    const handleRequireLogin = (place: string) => {
        if (uid) {
            navigate(place);
        } else {
            addToast("Login required", "You need to login to use this feature");
        }
    };

    return (
        <header className="header">
            <div className="header__info">
                <div className="header__info__personal">
                    <div className="header__info__personal__item">
                        <IoCall color="white" />
                        <address>(+84) 123 456 7890</address>
                    </div>
                    <div className="header__info__personal__item">
                        <IoMailSharp color="white" />
                        <address>digital-e@gmail.com</address>
                    </div>
                    <div className="header__info__personal__item">
                        <IoHome color="white" />
                        <address>123 ABC Street, HCM City</address>
                    </div>
                </div>
                <div className="header__info__auth">
                    <strong>Welcome {userData && !loading ? userData.username : "Anonymous"}</strong>

                    <div className="header__info__auth__button">
                        {userData && !loading ? (
                            <div>
                                <Link to="/" onClick={handleLogout}>
                                    Logout
                                </Link>
                            </div>
                        ) : (
                            <div>
                                <Link to="/login">Login</Link>
                                <span> | </span>
                                <Link to="/signup">Signup</Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="header__main">
                <div className="header__main__brand">
                    <Navbar.Brand href="/" className="header__main__brand__link">
                        DIGITAL-E
                    </Navbar.Brand>
                </div>
                <div className="header__main__search">
                    <input
                        type="text"
                        name="header_search"
                        id="header_search"
                        placeholder="Search"
                        className="header__main__search__bar"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button onClick={handleSearch}>Search</button>
                </div>
                <div className="header__main__group">
                    <div className="header__main__group__item" onClick={() => handleRequireLogin("/wishlist")}>
                        <IoHeart size={28} />
                        Wishlist
                    </div>
                    <div className="header__main__group__item" onClick={() => handleRequireLogin("/cart")}>
                        <IoCart size={28} />
                        Shopping Cart
                    </div>
                </div>
            </div>
        </header>
    );
};
