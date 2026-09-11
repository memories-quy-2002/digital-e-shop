import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { sendFirebasePasswordReset } from "../../../services/firebase";
import "../../../styles/features/auth/_login.scss";

const ForgotPasswordPage = () => {
    const { addToast } = useToast();
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setIsSubmitting(true);
        try {
            await sendFirebasePasswordReset(email.trim());
            setSubmitted(true);
            addToast("Password reset", "If an account matches that email, a reset link is on its way.");
        } catch {
            // Keep the same public response for existing and unknown emails.
            setSubmitted(true);
            addToast("Password reset", "If an account matches that email, a reset link is on its way.");
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
                    <div className="login__form__errors" role="status">
                        <div>
                            Check your inbox for a password reset link. If you do not see it, check spam.
                        </div>
                    </div>
                ) : null}
                <form className="login__form__container" onSubmit={handleSubmit}>
                    <label htmlFor="forgot-password-email">Email</label>
                    <input
                        id="forgot-password-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
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
