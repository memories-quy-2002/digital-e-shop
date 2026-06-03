import React from "react";
import { Helmet } from "react-helmet";
import { Link } from "react-router-dom";
import { SearchIcon } from "../components/common/Icons";
import EmptyState from "../components/common/EmptyState";
import Layout from "../components/layout/Layout";
import "../styles/pages/_not-found.scss";

const NotFoundPage = () => {
    return (
        <Layout>
            <Helmet>
                <title>Page Not Found | Digital-E</title>
                <meta name="description" content="The page you are looking for does not exist." />
            </Helmet>
            <main className="not-found">
                <section className="not-found__hero">
                    <span className="not-found__eyebrow">Error 404</span>
                    <h1>That page is not available.</h1>
                    <p>
                        The link may be outdated, the address may be incorrect, or the page may have moved somewhere
                        else in the store.
                    </p>
                    <div className="not-found__actions">
                        <Link to="/">Go to home</Link>
                        <Link to="/shops" className="ghost">
                            Browse products
                        </Link>
                    </div>
                </section>

                <section className="not-found__panel">
                    <EmptyState
                        compact
                        icon={<SearchIcon size={20} />}
                        title="Try a different route"
                        description="Return to the storefront, search for a product, or head back to your account to continue where you left off."
                        actionLabel="Open account"
                        actionTo="/account"
                    />
                </section>
            </main>
        </Layout>
    );
};

export default NotFoundPage;
