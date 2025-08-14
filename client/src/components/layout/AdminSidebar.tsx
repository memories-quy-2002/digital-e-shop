import React from "react";
import { AiFillDashboard } from "react-icons/ai";
import { FaBox, FaCartShopping, FaUser } from "react-icons/fa6";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";
const items = ["Dashboard", "Products", "Orders", "Accounts"];
const itemIcons = [
    <AiFillDashboard size={20} key={0} />,
    <FaBox size={20} key={1} />,
    <FaCartShopping size={20} key={2} />,
    <FaUser size={20} key={3} />,
];

const AdminSidebar = () => {
    const navigate = useNavigate();
    const url = window.location.href;
    const paramItem = url.split("/admin/")[1];
    // console.log(paramItem);
    const { userData, loading } = useAuth();

    const handleAdminNavigate = (item: string) => {
        if (item === "dashboard") {
            navigate("/admin");
        } else {
            navigate(`/admin/${item}`);
        }
    };

    return (
        <aside className="admin__layout__sidebar">
            <section className="admin__layout__sidebar__title">
                <h3>DIGITAL-E</h3>
                <strong>Admin Panel</strong>
            </section>
            <section className="admin__layout__sidebar__information">
                <img src={productPlaceholder} alt="admin_avatar" className="admin__layout__sidebar__information__img" />
                <div className="admin__layout__sidebar__information__user">
                    <strong>{userData && !loading ? userData.username : "Anonymous"}</strong>
                    <span>{userData && !loading ? userData.email : "Anonymous"}</span>
                </div>
            </section>
            <nav className="admin__layout__sidebar__navigation">
                {items.map((item, index) => {
                    return (
                        <button
                            type="button"
                            key={index}
                            onClick={() => handleAdminNavigate(item.toLowerCase())}
                            className={
                                paramItem === item.toLowerCase() || (!paramItem && item === "Dashboard") ? "active" : ""
                            }
                        >
                            {itemIcons[index]}
                            {item}
                        </button>
                    );
                })}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
