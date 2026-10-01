import React from "react";
import { Header } from "./Header";
import Footer from "./Footer";
import ComparisonTray from "../../features/products/components/ComparisonTray";
import { useT } from "../../hooks/useT";

interface LayoutProps {
    children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
    const t = useT();

    return (
        <div className="app-shell">
            <a className="app-shell__skip-link" href="#main-content">
                {t("common.skipToMainContent")}
            </a>
            <Header />
            <main id="main-content" className="app-shell__content" tabIndex={-1}>
                {children}
            </main>
            <ComparisonTray />
            <Footer />
        </div>
    );
};

export default Layout;
