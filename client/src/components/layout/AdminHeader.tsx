import React, { useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { FaHome } from "react-icons/fa";
import { IoLogOutOutline, IoNotifications, IoSearch } from "react-icons/io5";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { useToast } from "../../context/ToastContext";
import { Helmet } from "react-helmet";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { auth } from "../../services/firebase";

const cookies = new Cookies();
const UNREAD_COUNT = 1;
const AdminHeader = () => {
    const { addToast } = useToast();
    const navigate = useNavigate();
    const [show, setShow] = useState<boolean>(false);
    const handleClick = () => {
        setShow(true);
    };
    const handleClose = () => {
        setShow(false);
    };
    const handleLogout = async () => {
        try {
            const response = await axios.post("/api/users/logout");
            sessionStorage.removeItem("rememberMe");
            cookies.remove("rememberMe");
            await signOut(auth);
            addToast("Logout successfully", response.data?.msg || "Logged out");
        } catch (err: Error | unknown) {
            console.error(err);
            addToast("Logout", "You have been logged out.");
        } finally {
            navigate("/login");
        }
    };

    return (
        <header className="admin__layout__header">
            <Helmet>
                <title>Digital-E - Admin</title>
                <meta name="description" content="Admin Dashboard for Digital-E" />
            </Helmet>

            {/* Left Section */}
            <div className="admin__layout__header__left">
                <button type="button" className="admin__layout__header__home">
                    <FaHome />
                    <span>Home</span>
                </button>

                <div className="admin__layout__header__search">
                    <input type="text" placeholder="Search..." />
                    <button type="submit">
                        <IoSearch size={20} />
                    </button>
                </div>
            </div>

            {/* Right Section */}
            <div className="admin__layout__header__right">
                <div className="admin__layout__header__notifications">
                    <IoNotifications className="admin__layout__header__notifications__icon" size={24} />
                    {UNREAD_COUNT > 0 && (
                        <span className="admin__layout__header__notifications__badge">{UNREAD_COUNT}</span>
                    )}
                </div>

                <button className="admin__layout__header__logout" onClick={() => handleClick()}>
                    <span>Logout</span>
                    <IoLogOutOutline size={20} />
                </button>
            </div>

            {/* Logout Modal */}
            <Modal show={show} onHide={handleClose} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Logout</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure you want to logout?</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleLogout}>
                        Logout
                    </Button>
                </Modal.Footer>
            </Modal>
        </header>
    );
};

export default AdminHeader;
