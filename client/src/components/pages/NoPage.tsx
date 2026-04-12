import React from "react";
import { Link } from "react-router-dom";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

const NoPage = () => {
    return (
        <Layout>
            <Helmet>
                <title>Page Not Found | Digital-E</title>
                <meta name="description" content="The page you are looking for does not exist." />
            </Helmet>
            <main
                style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                    padding: "2rem",
                    gap: "0.75rem",
                }}
            >
                <h1>Page not found</h1>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>404 — we could not find that page</h2>
                <p style={{ color: "#374151", textAlign: "center", maxWidth: "28rem" }}>
                    Check the address or return to the store home to keep shopping.
                </p>
                <Link to="/" style={{ color: "#1d4ed8", fontWeight: 600 }}>
                    Back to Digital-E home
                </Link>
            </main>
        </Layout>
    );
};

export default NoPage;
