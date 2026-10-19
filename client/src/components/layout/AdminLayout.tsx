import React, { useCallback, useEffect, useState } from "react";
import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";
import { useT } from "../../hooks/useT";
import { useLocation } from "react-router-dom";
import "../../styles/features/admin/_shell.scss";

interface LayoutProps {
    children: React.ReactNode;
}

const SIDEBAR_FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getVisibleSidebarControls = (sidebar: HTMLElement | null) =>
    Array.from(sidebar?.querySelectorAll<HTMLElement>(SIDEBAR_FOCUSABLE_SELECTOR) ?? []).filter(
        (element) =>
            !element.closest("[hidden]") &&
            getComputedStyle(element).visibility !== "hidden" &&
            element.getClientRects().length > 0,
    );

function AdminLayout({ children }: LayoutProps) {
    const t = useT();
    const location = useLocation();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobileNavigation, setIsMobileNavigation] = useState(() =>
        window.matchMedia("(max-width: 1024px)").matches,
    );
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const closeSidebar = useCallback(() => {
        setIsSidebarOpen(false);
        if (isMobileNavigation && isSidebarOpen) {
            document.querySelector<HTMLButtonElement>(".admin__layout__main__header__menu")?.focus();
        }
    }, [isMobileNavigation, isSidebarOpen]);
    const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
    const toggleSidebarCollapsed = useCallback(() => setIsSidebarCollapsed((current) => !current), []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 1024px)");
        const updateMobileNavigation = () => {
            const isMobile = mediaQuery.matches;
            setIsMobileNavigation(isMobile);
            if (!isMobile) setIsSidebarOpen(false);
        };
        updateMobileNavigation();
        mediaQuery.addEventListener("change", updateMobileNavigation);
        return () => mediaQuery.removeEventListener("change", updateMobileNavigation);
    }, []);

    useEffect(() => {
        if (!isSidebarOpen) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeSidebar();
                return;
            }

            if (event.key !== "Tab" || !isMobileNavigation) return;
            const sidebar = document.getElementById("admin-navigation");
            const focusableElements = getVisibleSidebarControls(sidebar);
            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (!firstElement || !lastElement) {
                event.preventDefault();
                return;
            }

            const activeElement = document.activeElement;
            if (!sidebar?.contains(activeElement)) {
                event.preventDefault();
                (event.shiftKey ? lastElement : firstElement).focus();
            } else if (event.shiftKey && activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            } else if (!event.shiftKey && activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeSidebar, isMobileNavigation, isSidebarOpen]);

    useEffect(() => {
        if (!isSidebarOpen || !isMobileNavigation) return;
        const focusableElements = getVisibleSidebarControls(document.getElementById("admin-navigation"));
        const activeNavigationLink = focusableElements.find((element) => element.getAttribute("aria-current") === "page");
        (activeNavigationLink ?? focusableElements[0])?.focus();
    }, [isMobileNavigation, isSidebarOpen]);

    return (
        <div className="admin admin__shell">
            <a className="admin__skip-link" href="#admin-main-content">
                {t("common.skipToMainContent")}
            </a>
            <div className={`admin__layout${isSidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
                <AdminSidebar
                    isOpen={isSidebarOpen}
                    isMobile={isMobileNavigation}
                    isCollapsed={isSidebarCollapsed}
                    onClose={closeSidebar}
                    onToggleCollapsed={toggleSidebarCollapsed}
                />
                {isSidebarOpen ? (
                    <button
                        type="button"
                        className="admin__layout__scrim"
                        aria-label={t("header.closeMenu")}
                        onClick={closeSidebar}
                    />
                ) : null}
                <div className="admin__layout__main">
                    <AdminHeader onOpenSidebar={openSidebar} isSidebarOpen={isSidebarOpen} />
                    <div id="admin-main-content" className="admin__layout__main__body" tabIndex={-1}>
                        <div className="admin__route-content" key={location.pathname}>
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AdminLayout;
