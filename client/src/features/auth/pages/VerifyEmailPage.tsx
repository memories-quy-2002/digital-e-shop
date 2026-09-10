import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { confirmEmailVerification } from "../api";
import "../../../styles/features/auth/_login.scss";

type VerificationState = "loading" | "success" | "error";

const VerifyEmailPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setUserData } = useAuth();
    const token = searchParams.get("token")?.trim() || "";
    const processedToken = useRef<string | null>(null);
    const [state, setState] = useState<VerificationState>(token ? "loading" : "error");
    const [message, setMessage] = useState(
        token ? "Confirming your email address..." : "This verification link is missing its token.",
    );

    useEffect(() => {
        if (!token || processedToken.current === token) return;
        processedToken.current = token;

        const verify = async () => {
            try {
                const response = await confirmEmailVerification(token);
                if (response.userData) setUserData(response.userData);
                setState("success");
                setMessage("Your email is verified. Checkout and product reviews are now available.");
                navigate("/verify-email", { replace: true });
            } catch (error: unknown) {
                const response = error && typeof error === "object" && "response" in error
                    ? (error as { response?: { data?: { msg?: string } } }).response
                    : undefined;
                setState("error");
                setMessage(response?.data?.msg || "This verification link is invalid or expired.");
                navigate("/verify-email", { replace: true });
            }
        };

        void verify();
    }, [navigate, setUserData, token]);

    return (
        <main className="auth-page">
            <Helmet>
                <title>Verify email | Digital-E</title>
                <meta name="description" content="Verify your Digital-E email address." />
            </Helmet>
            <section className="login__form" aria-labelledby="verify-email-title">
                <h1 id="verify-email-title" className="login__form__title">
                    {state === "success" ? "Email verified" : state === "loading" ? "Verifying email" : "Verification unavailable"}
                </h1>
                <p className="login__form__subtitle" role={state === "error" ? "alert" : "status"}>{message}</p>
                <div className="login__form__switch">
                    {state === "success" ? <Link to="/shops">Continue shopping</Link> : <Link to="/login">Back to login</Link>}
                </div>
            </section>
        </main>
    );
};

export default VerifyEmailPage;
