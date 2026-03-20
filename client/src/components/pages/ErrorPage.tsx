import React from "react";
import Layout from "../layout/Layout";
import { Helmet } from "react-helmet";

type ErrorProps = {
    error: string;
};

const ErrorPage = ({ error }: ErrorProps) => {
    return (
        <Layout>
            <Helmet>
                <title>Something Went Wrong | Digital-E</title>
                <meta name="description" content="An error occurred while processing your request." />
            </Helmet>
            <main>
                <div>404 Error</div>
                <p>{error}</p>
            </main>
        </Layout>
    );
};

export default ErrorPage;
