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
            {/* Logo / Brand */}
            <section className="admin__layout__sidebar__brand">
                <h3>DIGITAL-E</h3>
                <span>Admin Panel</span>
            </section>

            {/* User Info */}
            <section className="admin__layout__sidebar__user">
                <img src={productPlaceholder} alt="admin_avatar" className="admin__layout__sidebar__user__avatar" />
                <div className="admin__layout__sidebar__user__info">
                    <strong>{userData && !loading ? userData.username : "Anonymous"}</strong>
                    <span>{userData && !loading ? userData.email : "anonymous@example.com"}</span>
                </div>
            </section>

            {/* Navigation */}
            <nav className="admin__layout__sidebar__nav">
                {items.map((item, index) => (
                    <button
                        type="button"
                        key={index}
                        onClick={() => handleAdminNavigate(item.toLowerCase())}
                        className={`admin__layout__sidebar__nav__item ${
                            paramItem === item.toLowerCase() || (!paramItem && item === "Dashboard") ? "active" : ""
                        }`}
                    >
                        <span className="admin__layout__sidebar__nav__icon">{itemIcons[index]}</span>
                        <span className="admin__layout__sidebar__nav__label">{item}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
