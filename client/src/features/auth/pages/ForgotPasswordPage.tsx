import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { useToast } from "../../../context/ToastContext";
import { sendFirebasePasswordReset } from "../../../services/firebase";
import { useT } from "../../../hooks/useT";
import { getFirebaseAuthErrorCode, getFirebaseAuthErrorMessage } from "../authErrors";
import AuthShell from "../components/AuthShell";

const ForgotPasswordPage = () => {
    const { addToast } = useToast();
    const t = useT();
    const [email, setEmail] = useState("");
    const [submitted, setSubmitted] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const normalizedEmail = email.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
            setSubmitted(false);
            setErrorMessage(t("auth.resetInvalidEmail"));
            return;
        }

        setIsSubmitting(true);
        setSubmitted(false);
        setErrorMessage("");
        try {
            await sendFirebasePasswordReset(normalizedEmail);
            setSubmitted(true);
            addToast(t("auth.resetToastTitle"), t("auth.resetSuccessToast"));
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
                    t("auth.resetUnavailable"),
                );
                setErrorMessage(message);
                addToast(t("auth.resetUnavailableTitle"), message);
            } else {
                // Keep the same public response for existing and unknown emails.
                setSubmitted(true);
                addToast(t("auth.resetToastTitle"), t("auth.resetSuccessToast"));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Helmet>
                <title>{t("auth.resetTitle")} | Digital-E</title>
            </Helmet>
            <AuthShell
                mode="login"
                titleId="forgot-password-title"
                eyebrow={t("auth.resetEyebrow")}
                title={t("auth.resetTitle")}
                description={t("auth.resetDescription")}
                storyTitle={t("auth.resetStoryTitle")}
                storyDescription={t("auth.resetStoryDescription")}
                footer={<p className="auth-form__switch">{t("auth.haveAccount")} <Link to="/login">{t("auth.backToLogin")}</Link></p>}
            >
                {submitted ? (
                    <div className="auth-form__general-error" role="status" aria-live="polite">
                        {t("auth.resetSuccessMessage")}
                    </div>
                ) : null}
                {errorMessage ? (
                    <div id="forgot-password-error" className="auth-form__general-error" role="alert" aria-live="assertive">
                        {errorMessage}
                    </div>
                ) : null}
                <form className="auth-form auth-form--login" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="forgot-password-email">{t("auth.email")}</label>
                        <input
                            id="forgot-password-email"
                            className="auth-form__input"
                            type="email"
                            autoComplete="email"
                            required
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            aria-invalid={Boolean(errorMessage)}
                            aria-describedby={errorMessage ? "forgot-password-error" : undefined}
                        />
                    </div>
                    <button className="auth-form__submit" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                        {isSubmitting ? t("auth.sendingReset") : t("auth.sendReset")}
                        <span aria-hidden="true">→</span>
                    </button>
                </form>
            </AuthShell>
        </>
    );
};

export default ForgotPasswordPage;
