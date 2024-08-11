import { useContext, useEffect } from "react";
import { FaBox, FaCartShopping, FaUser } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import { UserContext } from "../../../context/UserDataContext";

const cookies = new Cookies();

const items = ["Product", "Order", "Account"];
const itemIcons = [<FaBox />, <FaCartShopping />, <FaUser />];

const AdminSidebar = () => {
    const navigate = useNavigate();
    const url = window.location.href;
    const paramItem = url.split("/admin/")[1];
    // console.log(paramItem);

    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const { userData, loading, fetchUserData } = useContext(UserContext);
    useEffect(() => {
        fetchUserData(uid);
    }, [uid]);

    const handleAdminNavigate = (item: string) => {
        navigate(`/admin/${item}`);
    };

    return (
        <div className="admin__layout__sidebar">
            <div className="admin__layout__sidebar__title">
                <h3>DIGITAL-E</h3>
                <strong>Admin Panel</strong>
            </div>
            <div className="admin__layout__sidebar__information">
                <img
                    src={require("../../../assets/images/product_placeholder.jpg")}
                    alt="admin_avatar"
                    className="admin__layout__sidebar__information__img"
                />
                <div>
                    <strong>
                        Welcome back,{" "}
                        {userData && !loading ? userData.username : "Anonymous"}
                    </strong>
                    <p>{userData && !loading ? userData.email : "Anonymous"}</p>
                </div>
            </div>
            <div className="admin__layout__sidebar__navigation">
                {items.map((item, index) => {
                    return (
                        <button
                            type="button"
                            key={index}
                            onClick={() =>
                                handleAdminNavigate(item.toLowerCase())
                            }
                            className={
                                paramItem === item.toLowerCase() ? "active" : ""
                            }
                        >
                            {itemIcons[index]}
                            {item.toUpperCase() + "S"}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminSidebar;
