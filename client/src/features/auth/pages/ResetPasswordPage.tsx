import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
    confirmFirebasePasswordReset,
    verifyFirebasePasswordResetCode,
} from "../../../services/firebase";
import "../../../styles/features/auth/_login.scss";

type ResetState = "loading" | "ready" | "success" | "error";

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const firebaseCode = searchParams.get("oobCode")?.trim() || "";
    const [state, setState] = useState<ResetState>(firebaseCode ? "loading" : "error");
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [message, setMessage] = useState(
        firebaseCode
            ? "Validating your password reset link..."
            : "This password reset link is missing its Firebase action code.",
    );
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!firebaseCode) return;

        const validateFirebaseCode = async () => {
            try {
                const verifiedEmail = await verifyFirebasePasswordResetCode(firebaseCode);
                setState("ready");
                setMessage(`Resetting password for ${verifiedEmail}.`);
            } catch {
                setState("error");
                setMessage("This password reset link is invalid or expired.");
            }
        };

        void validateFirebaseCode();
    }, [firebaseCode]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirmation) {
            setError("Passwords do not match.");
            return;
        }

        try {
            setIsSubmitting(true);
            await confirmFirebasePasswordReset(firebaseCode, password);
            setState("success");
            setMessage("Your password has been reset successfully.");
            navigate("/reset-password", { replace: true });
    } catch {
            setError("Unable to reset your password. Please request a new Firebase link.");
            navigate("/reset-password", { replace: true });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-page">
            <Helmet>
                <title>Reset password | Digital-E</title>
                <meta name="description" content="Set a new Digital-E account password." />
            </Helmet>
            <section className="login__form" aria-labelledby="reset-password-title">
                <h1 id="reset-password-title" className="login__form__title">
                    {state === "success" ? "Password reset" : "Choose a new password"}
                </h1>
                <p className="login__form__subtitle" role={state === "error" ? "alert" : "status"}>{message}</p>
                {state === "ready" ? (
                    <form className="login__form__container" onSubmit={handleSubmit}>
                        <label htmlFor="reset-password-new">New password</label>
                        <input
                            id="reset-password-new"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                        <label htmlFor="reset-password-confirm">Confirm new password</label>
                        <input
                            id="reset-password-confirm"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                        />
                        {error ? <div className="login__form__errors" role="alert"><div>{error}</div></div> : null}
                        <button className="login__form__submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Resetting..." : "Reset password"}
                        </button>
                    </form>
                ) : null}
                {state === "success" || state === "error" ? (
                    <div className="login__form__switch"><Link to="/login">Back to login</Link></div>
                ) : null}
            </section>
        </main>
    );
};

export default ResetPasswordPage;
