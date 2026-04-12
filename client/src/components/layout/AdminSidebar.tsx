import React from "react";
import { BsBoxSeam, BsCart3, BsPersonFill, BsSpeedometer2 } from "react-icons/bs";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import productPlaceholder from "../../assets/images/product_placeholder.jpg";
const items = ["Dashboard", "Products", "Orders", "Accounts"];
const itemIcons = [
    <BsSpeedometer2 size={20} key={0} />,
    <BsBoxSeam size={20} key={1} />,
    <BsCart3 size={20} key={2} />,
    <BsPersonFill size={20} key={3} />,
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
            <section className="admin__layout__sidebar__title">
                <p className="admin__layout__sidebar__title__brand">DIGITAL-E</p>
                <span className="admin__layout__sidebar__title__tag">Admin Panel</span>
            </section>

            {/* User Info */}
            <section className="admin__layout__sidebar__information">
                <img src={productPlaceholder} className="admin__layout__sidebar__information__img" />
                <div className="admin__layout__sidebar__information__user">
                    <strong>{userData && !loading ? userData.username : "Anonymous"}</strong>
                    <span>{userData && !loading ? userData.email : "anonymous@example.com"}</span>
                </div>
            </section>

            {/* Navigation */}
            <nav className="admin__layout__sidebar__navigation">
                {items.map((item, index) => (
                    <button
                        type="button"
                        key={index}
                        onClick={() => handleAdminNavigate(item.toLowerCase())}
                        className={`admin__layout__sidebar__navigation__item ${
                            paramItem === item.toLowerCase() || (!paramItem && item === "Dashboard") ? "active" : ""
                        }`}
                    >
                        <span className="admin__layout__sidebar__navigation__icon">{itemIcons[index]}</span>
                        <span className="admin__layout__sidebar__navigation__label">{item}</span>
                    </button>
                ))}
            </nav>
        </aside>
    );
};

export default AdminSidebar;
