import React from "react";
import { IoLogOutOutline } from "react-icons/io5";
import Cookies from "universal-cookie";

const cookies = new Cookies();

const AdminHeader = () => {
    const handleLogout = () => {
        sessionStorage.removeItem("rememberMe");
        cookies.remove("rememberMe");
    };
    return (
        <div className="admin__layout__main__header">
            <div>Dashboard</div>
            <button onClick={() => handleLogout()}>
                LOGOUT
                <IoLogOutOutline size={20} />
            </button>
        </div>
    );
};

export default AdminHeader;
