import React from "react";
import Layout from "../layout/Layout";

type ErrorProps = {
	error: string;
};

const ErrorPage = ({ error }: ErrorProps) => {
	return (
		<Layout>
			<main>
				<div>404 Error</div>
				<p>{error}</p>
			</main>
		</Layout>
	);
};

export default ErrorPage;
