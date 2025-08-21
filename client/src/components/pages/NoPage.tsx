import React from "react";
import Layout from "../layout/Layout";
import NavigationBar from "../common/NavigationBar";
import { Helmet } from "react-helmet";

const NoPage = () => {
    return (
        <Layout>
            <NavigationBar />
            <Helmet>
                <title>Page Not Found</title>
                <meta name="description" content="The page you are looking for does not exist." />
            </Helmet>
            <main
                style={{
                    display: "flex",
                    alignItems: "center",
                    flexDirection: "column",
                }}
            >
                <h1>404 Error</h1>
                <p>Page not found</p>
            </main>
        </Layout>
    );
};

export default NoPage;
