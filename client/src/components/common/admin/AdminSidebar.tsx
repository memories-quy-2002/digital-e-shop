import { useContext, useEffect } from "react";
import { FaBox, FaCartShopping, FaUser } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import { UserContext } from "../../../context/UserDataContext";
import { AiFillDashboard } from "react-icons/ai";

const cookies = new Cookies();

const items = ["Dashboard", "Products", "Orders", "Customers"];
const itemIcons = [
    <AiFillDashboard size={20} />,
    <FaBox size={20} />,
    <FaCartShopping size={20} />,
    <FaUser size={20} />,
];

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
    console.log(uid);

    const handleAdminNavigate = (item: string) => {
        if (item === "dashboard") {
            navigate("/admin");
        } else {
            navigate(`/admin/${item}`);
        }
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
                <div className="admin__layout__sidebar__information__user">
                    <strong>
                        {userData && !loading ? userData.username : "Anonymous"}
                    </strong>
                    <span>
                        {userData && !loading ? userData.email : "Anonymous"}
                    </span>
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
                                paramItem === item.toLowerCase() ||
                                (!paramItem && item === "Dashboard")
                                    ? "active"
                                    : ""
                            }
                        >
                            {itemIcons[index]}
                            {item}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminSidebar;
