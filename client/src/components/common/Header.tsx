import { useContext, useEffect } from "react";
import { Navbar } from "react-bootstrap";
import { IoCall, IoCart, IoHeart, IoHome, IoMailSharp } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import { UserContext } from "../../context/UserDataContext";
import "../../styles/Header.scss";
import { useToast } from "../../context/ToastContext";

const cookies = new Cookies();

export const Header = (): JSX.Element => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const { userData, loading, fetchUserData } = useContext(UserContext);
    useEffect(() => {
        fetchUserData(uid);
    }, [uid]);

    const handleLogout = () => {
        sessionStorage.removeItem("rememberMe");
        cookies.remove("rememberMe");
        window.location.reload();
    };

    const handleRequireLogin = (place: string) => {
        if (uid) {
            navigate(place);
        } else {
            addToast("Login required", "You need to login to use this feature");
        }
    };

    return (
        <div className="header__container">
            <div className="header__container__info">
                <div className="header__container__info__personal">
                    <div className="header__container__info__personal__item">
                        <IoCall color="white" />
                        (+84) 123 456 7890
                    </div>
                    <div className="header__container__info__personal__item">
                        <IoMailSharp color="white" />
                        digital-e@gmail.com
                    </div>
                    <div className="header__container__info__personal__item">
                        <IoHome color="white" />
                        123 ABC Street, HCM City
                    </div>
                </div>
                <div className="header__container__info__auth">
                    <strong>
                        Welcome{" "}
                        {userData && !loading ? userData.username : "Anonymous"}
                    </strong>

                    <div className="header__container__info__auth__button">
                        {userData && !loading ? (
                            <div>
                                <a href="/" onClick={handleLogout}>
                                    Logout
                                </a>
                            </div>
                        ) : (
                            <>
                                <div>
                                    <a href="/login">Login</a>
                                </div>
                                <div>|</div>
                                <div>
                                    <a href="/signup">Signup</a>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
            <div className="header__container__main">
                <div className="header__container__main__brand">
                    <Navbar.Brand
                        href="/"
                        className="header__container__main__brand__link"
                    >
                        DIGITAL-E
                    </Navbar.Brand>
                </div>
                <div className="header__container__main__search">
                    <input
                        type="text"
                        name=""
                        id=""
                        placeholder="Search product..."
                        className="header__container__main__search__bar"
                    />
                    <button onClick={() => navigate("/product?id=1")}>
                        Search
                    </button>
                </div>
                <div className="header__container__main__group">
                    <div
                        className="header__container__main__group__item"
                        onClick={() => handleRequireLogin("/wishlist")}
                    >
                        <IoHeart size={28} />
                        Wishlist
                    </div>
                    <div
                        className="header__container__main__group__item"
                        onClick={() => handleRequireLogin("/cart")}
                    >
                        <IoCart size={28} />
                        Shopping Cart
                    </div>
                </div>
            </div>
        </div>
    );
};
