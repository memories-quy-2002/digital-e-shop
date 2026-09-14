import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { sendFirebasePasswordReset } from "../../../services/firebase";
import "../../../styles/features/auth/_login.scss";
import { getFirebaseAuthErrorCode, getFirebaseAuthErrorMessage } from "../authErrors";

const ForgotPasswordPage = () => {
    const { addToast } = useToast();
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
            setSubmitted(false);
            setErrorMessage("Enter a valid email address.");
            return;
        }

        setIsSubmitting(true);
        setSubmitted(false);
        setErrorMessage("");
        try {
            await sendFirebasePasswordReset(normalizedEmail);
            setSubmitted(true);
            addToast("Password reset", "If an account matches that email, a reset link is on its way.");
        } catch (error: unknown) {
            const code = getFirebaseAuthErrorCode(error);
            const isFirebaseUnavailable = [
                "auth/network-request-failed",
                "auth/invalid-api-key",
                "auth/emulator-config-failed",
                "auth/internal-error",
            ].includes(code || "");

            if (isFirebaseUnavailable) {
                const message = getFirebaseAuthErrorMessage(
                    error,
                    "Password reset is temporarily unavailable. Please try again later.",
                );
                setErrorMessage(message);
                addToast("Password reset unavailable", message);
            } else {
                // Keep the same public response for existing and unknown emails.
                setSubmitted(true);
                addToast("Password reset", "If an account matches that email, a reset link is on its way.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-page">
            <Helmet>
                <title>Reset password | Digital-E</title>
            </Helmet>
            <section className="login__form" aria-labelledby="forgot-password-title">
                <h1 id="forgot-password-title" className="login__form__title">Reset your password</h1>
                {submitted ? (
                    <div className="login__form__errors" role="status" aria-live="polite">
                        <div>
                            Check your inbox for a password reset link. If you do not see it, check spam.
                        </div>
                    </div>
                ) : null}
                {errorMessage ? (
                    <div id="forgot-password-error" className="login__form__errors" role="alert" aria-live="assertive">
                        {errorMessage}
                    </div>
                ) : null}
                <form className="login__form__container" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
                    <label htmlFor="forgot-password-email">Email</label>
                    <input
                        id="forgot-password-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        aria-invalid={Boolean(errorMessage)}
                        aria-describedby={errorMessage ? "forgot-password-error" : undefined}
                    />
                    <button className="login__form__submit" type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Sending..." : "Send reset link"}
                    </button>
                    <div className="login__form__switch"><Link to="/login">Back to login</Link></div>
                </form>
            </section>
        </main>
    );
};

export default ForgotPasswordPage;
