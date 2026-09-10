import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { unsubscribeFromMarketing } from "../features/marketing/api";
import "../styles/features/auth/_login.scss";

type UnsubscribeState = "loading" | "success" | "error";

const UnsubscribePage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get("token")?.trim() || "";
    const processedToken = useRef<string | null>(null);
    const [state, setState] = useState<UnsubscribeState>(token ? "loading" : "error");
    const [message, setMessage] = useState(
        token ? "Updating your marketing preferences..." : "This unsubscribe link is missing its token.",
    );

    useEffect(() => {
        if (!token || processedToken.current === token) return;
        processedToken.current = token;

        const unsubscribe = async () => {
            try {
                await unsubscribeFromMarketing(token);
                setState("success");
                setMessage("You have been unsubscribed from marketing emails.");
                navigate("/unsubscribe", { replace: true });
            } catch {
                setState("error");
                setMessage("This unsubscribe link is invalid or has already been used.");
                navigate("/unsubscribe", { replace: true });
            }
        };

        void unsubscribe();
    }, [navigate, token]);

    return (
        <main className="auth-page">
            <Helmet>
                <title>Marketing preferences | Digital-E</title>
                <meta name="description" content="Manage Digital-E marketing email preferences." />
            </Helmet>
            <section className="login__form" aria-labelledby="unsubscribe-title">
                <h1 id="unsubscribe-title" className="login__form__title">
                    {state === "success" ? "Preferences updated" : state === "loading" ? "Updating preferences" : "Link unavailable"}
                </h1>
                <p className="login__form__subtitle" role={state === "error" ? "alert" : "status"}>{message}</p>
                <div className="login__form__switch"><Link to="/">Back to Digital-E</Link></div>
            </section>
        </main>
    );
};

export default UnsubscribePage;
