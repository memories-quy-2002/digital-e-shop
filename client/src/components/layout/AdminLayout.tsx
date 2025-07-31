import React from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import "../../styles/Admin.scss";

interface LayoutProps {
    children: React.ReactNode;
}

function AdminLayout({ children }: LayoutProps) {
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
}

export default AdminLayout;
