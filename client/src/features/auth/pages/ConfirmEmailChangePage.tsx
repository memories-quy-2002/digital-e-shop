import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { confirmEmailChange } from "../api";
import "../../../styles/features/auth/_login.scss";

type ConfirmationState = "loading" | "success" | "error";

const ConfirmEmailChangePage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setUserData } = useAuth();
    const token = searchParams.get("token")?.trim() || "";
    const processedToken = useRef<string | null>(null);
    const [state, setState] = useState<ConfirmationState>(token ? "loading" : "error");
    const [message, setMessage] = useState(
        token ? "Confirming your new email address..." : "This email-change link is missing its token.",
    );

    useEffect(() => {
        if (!token || processedToken.current === token) return;
        processedToken.current = token;

        const confirm = async () => {
            try {
                const response = await confirmEmailChange(token);
                if (response.userData) setUserData(response.userData);
                setState("success");
                setMessage("Your email was changed successfully.");
                navigate("/confirm-email-change", { replace: true });
            } catch (error: unknown) {
                const response = error && typeof error === "object" && "response" in error
                    ? (error as { response?: { data?: { msg?: string } } }).response
                    : undefined;
                setState("error");
                setMessage(response?.data?.msg || "This email-change link is invalid or expired.");
                navigate("/confirm-email-change", { replace: true });
            }
        };

        void confirm();
    }, [navigate, setUserData, token]);

    return (
        <main className="auth-page">
            <Helmet>
                <title>Confirm email change | Digital-E</title>
                <meta name="description" content="Confirm the new email address for your Digital-E account." />
            </Helmet>
            <section className="login__form" aria-labelledby="confirm-email-change-title">
                <h1 id="confirm-email-change-title" className="login__form__title">
                    {state === "success" ? "Email changed" : state === "loading" ? "Confirming email" : "Email change unavailable"}
                </h1>
                <p className="login__form__subtitle" role={state === "error" ? "alert" : "status"}>{message}</p>
                <div className="login__form__switch">
                    {state === "success" ? <Link to="/account">Go to my account</Link> : <Link to="/login">Back to login</Link>}
                </div>
            </section>
        </main>
    );
};

export default ConfirmEmailChangePage;
