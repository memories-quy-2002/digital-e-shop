import React, { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import {
    confirmFirebasePasswordReset,
    verifyFirebasePasswordResetCode,
} from "../../../services/firebase";
import { getFirebaseAuthErrorMessage } from "../authErrors";
import { useT } from "../../../hooks/useT";
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import "../../../styles/features/auth/_login.scss";

type ResetState = "loading" | "ready" | "success" | "error";

const ResetPasswordPage = () => {
    const t = useT();
    const copy = useCustomerJourneyCopy();
    const copyRef = useRef(copy);
    copyRef.current = copy;
    const [searchParams] = useSearchParams();
    const firebaseCode = searchParams.get("oobCode")?.trim() || "";
    const [state, setState] = useState<ResetState>(firebaseCode ? "loading" : "error");
    const [password, setPassword] = useState("");
    const [confirmation, setConfirmation] = useState("");
    const [message, setMessage] = useState<string>(
        firebaseCode ? copy.auth.resetValidatingLink : copy.auth.resetMissingCode,
    );
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!firebaseCode) return;

        const validateFirebaseCode = async () => {
            try {
                const verifiedEmail = await verifyFirebasePasswordResetCode(firebaseCode);
                setState("ready");
                setMessage(copyRef.current.auth.resettingFor(verifiedEmail));
            } catch {
                setState("error");
                setMessage(copyRef.current.auth.resetInvalidLink);
            }
        };

        void validateFirebaseCode();
    }, [firebaseCode]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        if (password.length < 8) {
            setError(copy.auth.resetPasswordTooShort);
            return;
        }
        if (password !== confirmation) {
            setError(copy.auth.resetPasswordsDoNotMatch);
            return;
        }

        try {
            setIsSubmitting(true);
            await confirmFirebasePasswordReset(firebaseCode, password);
            setState("success");
            setMessage(copy.auth.resetPasswordSuccess);
        } catch (error: unknown) {
            const message = getFirebaseAuthErrorMessage(
                error,
                copy.auth.resetPasswordFallback,
            );
            setState("error");
            setMessage(message);
            setError("");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="auth-page">
            <Helmet>
                <title>{t("auth.resetTitle")} | Digital-E</title>
                <meta name="description" content={copy.auth.resetMetaDescription} />
            </Helmet>
            <section className="login__form" aria-labelledby="reset-password-title">
                <h1 id="reset-password-title" className="login__form__title">
                    {state === "success" ? copy.auth.resetPageSuccessTitle : copy.auth.resetPageChooseTitle}
                </h1>
                <p className="login__form__subtitle" role={state === "error" ? "alert" : "status"}>{message}</p>
                {state === "ready" ? (
                    <form className="login__form__container" onSubmit={handleSubmit} noValidate aria-busy={isSubmitting}>
                        <label htmlFor="reset-password-new">{copy.auth.resetNewPasswordLabel}</label>
                        <input
                            id="reset-password-new"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? "reset-password-error" : undefined}
                        />
                        <label htmlFor="reset-password-confirm">{copy.auth.resetConfirmPasswordLabel}</label>
                        <input
                            id="reset-password-confirm"
                            type="password"
                            autoComplete="new-password"
                            required
                            value={confirmation}
                            onChange={(event) => setConfirmation(event.target.value)}
                            aria-invalid={Boolean(error)}
                            aria-describedby={error ? "reset-password-error" : undefined}
                        />
                        {error ? <div id="reset-password-error" className="login__form__errors" role="alert"><div>{error}</div></div> : null}
                        <button className="login__form__submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? copy.auth.resettingPassword : copy.auth.submitResetPassword}
                        </button>
                    </form>
                ) : null}
                {state === "success" || state === "error" ? (
                    <div className="login__form__switch"><Link to="/login">{t("auth.backToLogin")}</Link></div>
                ) : null}
            </section>
        </main>
    );
};

export default ResetPasswordPage;
