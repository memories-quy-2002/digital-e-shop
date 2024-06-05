import React from "react";
import AdminHeader from "../common/admin/AdminHeader";
import AdminSidebar from "../common/admin/AdminSidebar";
import "../../styles/Admin.scss";

interface LayoutProps {
    children: React.ReactNode;
}

const AdminLayout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div className="admin">
            <div className="admin__layout">
                <AdminSidebar />
                <div className="admin__layout__main">
                    <AdminHeader />
                    {children}
                </div>
            </div>
        </div>
    );
};

export default AdminLayout;
