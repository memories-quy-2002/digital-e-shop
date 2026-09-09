import React, { useCallback, useEffect, useState } from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import "../../styles/features/admin/_shell.scss";

interface LayoutProps {
    children: React.ReactNode;
}

function AdminLayout({ children }: LayoutProps) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
    const toggleSidebarCollapsed = useCallback(() => setIsSidebarCollapsed((current) => !current), []);

    useEffect(() => {
        if (!isSidebarOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") closeSidebar();
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeSidebar, isSidebarOpen]);

    return (
        <div className="admin admin__shell">
            <div className={`admin__layout${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
                <AdminSidebar
                    isOpen={isSidebarOpen}
                    isCollapsed={isSidebarCollapsed}
                    onClose={closeSidebar}
                    onToggleCollapsed={toggleSidebarCollapsed}
                />
                {isSidebarOpen ? (
                    <button
                        type="button"
                        className="admin__layout__scrim"
                        aria-label="Close admin navigation"
                        onClick={closeSidebar}
                    />
                ) : null}
                <div className="admin__layout__main">
                    <AdminHeader onOpenSidebar={openSidebar} isSidebarOpen={isSidebarOpen} />
                    <div className="admin__layout__main__body">{children}</div>
                </div>
            </div>
        </div>
    );
}

export default AdminLayout;
