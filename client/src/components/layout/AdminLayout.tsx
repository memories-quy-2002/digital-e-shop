import React from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import "../../styles/features/admin/_shell.scss";

interface LayoutProps {
    children: React.ReactNode;
}

function AdminLayout({ children }: LayoutProps) {
    return (
        <div className="admin admin__shell">
            <div className="admin__layout">
                <AdminSidebar />
                <div className="admin__layout__main">
                    <AdminHeader />
                    <div className="admin__layout__main__body">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default AdminLayout;
