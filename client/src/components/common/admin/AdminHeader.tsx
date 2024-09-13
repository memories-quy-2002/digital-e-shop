import React, { useState } from "react";
import { Button, Modal } from "react-bootstrap";
import { FaHome } from "react-icons/fa";
import { IoLogOutOutline, IoNotifications, IoSearch } from "react-icons/io5";
import Cookies from "universal-cookie";
import axios from "../../../api/axios";
import { useToast } from "../../../context/ToastContext";
import { Helmet } from "react-helmet";

const cookies = new Cookies();
const UNREAD_COUNT = 1;
const AdminHeader = () => {
    const { addToast } = useToast();
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
            if (response.status === 200) {
                sessionStorage.removeItem("rememberMe");
                cookies.remove("rememberMe");
                addToast("Logout successfully", response.data.msg);
                window.location.reload();
            }
        } catch (err) {
            throw err;
        }
    };

    return (
        <div className="admin__layout__main__header">
            <Helmet>
                <title>Digital-E - Admin</title>
            </Helmet>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: "2rem",
                    justifyContent: "center",
                }}
            >
                <div>
                    <button type="button">
                        <FaHome />
                        Home
                    </button>
                </div>
                <div className="admin__layout__main__header__search">
                    <input type="text" placeholder="Search..." />

                    <button type="submit">
                        <IoSearch size={20} />
                    </button>
                </div>
            </div>
            <div
                style={{
                    display: "flex",
                    flexDirection: "row",
                    gap: "0.5rem",
                    justifyContent: "center",
                    alignItems: "center",
                }}
            >
                <div className="admin__layout__main__header__notifications">
                    <IoNotifications
                        size={28}
                        className="admin__layout__main__header__notifications__icon"
                    />
                    {UNREAD_COUNT > 0 && (
                        <span className="admin__layout__main__header__notifications__badge">
                            {UNREAD_COUNT}
                        </span>
                    )}
                </div>
                <button onClick={() => handleClick()}>
                    LOGOUT
                    <IoLogOutOutline size={20} />
                </button>
            </div>
            <Modal show={show} onHide={handleClose} animation={false}>
                <Modal.Header closeButton>
                    <Modal.Title>Logout</Modal.Title>
                </Modal.Header>
                <Modal.Body>Are you sure to logout?</Modal.Body>
                <Modal.Footer>
                    <Button variant="secondary" onClick={handleClose}>
                        Cancel
                    </Button>
                    <Button variant="primary" onClick={handleLogout}>
                        Logout
                    </Button>
                </Modal.Footer>
            </Modal>
        </div>
    );
};

export default AdminHeader;
