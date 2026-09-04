import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { SearchIcon } from "../components/common/Icons";
import EmptyState from "../components/common/EmptyState";
import Layout from "../components/layout/Layout";
import "../styles/pages/_not-found.scss";
import { useT } from "../hooks/useT";

const NotFoundPage = () => {
    const t = useT();
    return (
        <Layout>
            <Helmet>
                <title>{`${t("notFound.title")} | Digital-E`}</title>
                <meta name="description" content="The page you are looking for does not exist." />
            </Helmet>
            <main className="not-found">
                <section className="not-found__hero">
                    <h1>{t("notFound.title")}</h1>
                    <p>{t("notFound.description")}</p>
                    <div className="not-found__actions">
                        <Link to="/">{t("notFound.backHome")}</Link>
                        <Link to="/shops" className="ghost">{t("home.viewAllProducts")}</Link>
                    </div>
                </section>

                <section className="not-found__panel">
                    <EmptyState
                        compact
                        icon={<SearchIcon size={20} />}
                        title={t("common.search")}
                        actionLabel={t("common.account")}
                        actionTo="/account"
                    />
                </section>
            </main>
        </Layout>
    );
};

export default NotFoundPage;
