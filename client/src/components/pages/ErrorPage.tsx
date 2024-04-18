import React from "react";
import Layout from "../layout/Layout";

type ErrorProps = {
	error: string;
};

const ErrorPage = ({ error }: ErrorProps) => {
	return (
		<Layout>
			<div>
				<div>404 Error</div>
				<p>{error}</p>
			</div>
		</Layout>
	);
};

export default ErrorPage;
