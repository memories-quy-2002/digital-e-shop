import { AxiosError } from "axios";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { HTTP_STATUS } from "../../../constants/http-status";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import type { UserCredential } from "firebase/auth";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { setFirebaseAuthPersistence } from "../../../services/firebasePersistence";
import { createFirebaseUser, sendFirebaseEmailVerification, signInWithFirebaseEmail } from "../../../services/firebase";
import AuthShell from "../components/AuthShell";
import { registerUser } from "../api";
import { getFirebaseAuthErrorMessage } from "../authErrors";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";

interface User {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
    confirm: string;
}

const SignupPage = () => {
    const t = useT();
    const { locale } = useLocale();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { setUserData } = useAuth();
    const [user, setUser] = useState<User>({ firstName: "", lastName: "", username: "", email: "", password: "", confirm: "" });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const formRef = useRef<HTMLFormElement | null>(null);

    const fieldErrors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const err of errors) {
            const lower = err.toLowerCase();
            if ((lower.includes("match") && lower.includes("password")) || err === t("auth.passwordMismatch")) map.confirm = err;
            else if (lower.includes("first name") || err === t("auth.firstNameRequired")) map.firstName = err;
            else if (lower.includes("last name") || err === t("auth.lastNameRequired")) map.lastName = err;
            else if (lower.includes("username")) map.username = err;
            else if (lower.includes("email") && !lower.includes("password")) map.email = err;
            else if (lower.includes("password") && lower.includes("confirm")) map.confirm = err;
            else if (lower.includes("password") && !lower.includes("email")) map.password = err;
            else map.general = err;
        }
        return map;
    }, [errors, t]);

    const passwordStrength = useMemo(() => {
        const checks = [
            user.password.length >= 8,
            /[a-z]/.test(user.password),
            /[A-Z]/.test(user.password),
            /\d/.test(user.password),
            /[@$!%*?&]/.test(user.password),
        ];
        return checks.filter(Boolean).length;
    }, [user.password]);

    const passwordsMismatch = user.confirm.length > 0 && user.password !== user.confirm;
    const hasRequiredFields = Boolean(
        user.firstName.trim()
        && user.lastName.trim()
        && user.username.trim()
        && user.email.trim()
        && user.password
        && user.confirm,
    );
    const confirmPasswordError = passwordsMismatch
        ? t("auth.passwordMismatch")
        : fieldErrors.confirm;

    useEffect(() => {
        if (errors.length === 0) return;
        formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        const normalizedFirstName = user.firstName.trim();
        const normalizedLastName = user.lastName.trim();
        const normalizedUsername = user.username.trim();
        const normalizedEmail = user.email.trim();

        if (!normalizedFirstName) errorsList.push(t("auth.firstNameRequired"));
        else if (normalizedFirstName.length > 100) errorsList.push(t("auth.firstNameInvalid"));
        if (!normalizedLastName) errorsList.push(t("auth.lastNameRequired"));
        else if (normalizedLastName.length > 100) errorsList.push(t("auth.lastNameInvalid"));
        if (!normalizedUsername) {
            errorsList.push("Enter a username.");
        } else if (!usernamePattern.test(normalizedUsername)) {
            errorsList.push("Username must be 3-15 characters long and contain only letters, numbers, periods, underscores, or hyphens.");
        }
        if (!normalizedEmail) {
            errorsList.push("Enter your email address.");
        } else if (!emailPattern.test(normalizedEmail)) {
            errorsList.push("Enter a valid email address.");
        }
        if (!user.password) {
            errorsList.push("Choose a password.");
        } else if (!passwordPattern.test(user.password)) {
            errorsList.push("Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character.");
        }
        if (!user.confirm) {
            errorsList.push("Confirm your password.");
        } else if (user.password !== user.confirm) {
            errorsList.push(t("auth.passwordMismatch"));
        }
        return errorsList;
    };

    const clearFieldError = (field: keyof User) => {
        setErrors((current) => current.filter((err) => {
            const lower = err.toLowerCase();
            if (field === "firstName") return !lower.includes("first name") && err !== t("auth.firstNameRequired") && err !== t("auth.firstNameInvalid");
            if (field === "lastName") return !lower.includes("last name") && err !== t("auth.lastNameRequired") && err !== t("auth.lastNameInvalid");
            if (field === "username") return !lower.includes("username");
            if (field === "email") return !lower.includes("email");
            if (field === "password") {
                return !lower.includes("password") || (lower.includes("match") && lower.includes("password"));
            }
            if (field === "confirm") {
                return err !== t("auth.passwordMismatch") && !(lower.includes("confirm") || lower.includes("match"));
            }
            return false;
        }));
    };

    const handleChangeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        const field = name as keyof User;
        setUser((current) => ({ ...current, [field]: value }));
        clearFieldError(field);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const errorsList = validateForm();

        if (errorsList.length > 0) {
            setErrors(errorsList);
            return;
        }

        setIsSubmitting(true);
        try {
            await setFirebaseAuthPersistence(false);
            const normalizedEmail = user.email.trim();
            const normalizedFirstName = user.firstName.trim();
            const normalizedLastName = user.lastName.trim();
            const normalizedUsername = user.username.trim();
            let userCredential: UserCredential;

            try {
                userCredential = await createFirebaseUser(normalizedEmail, user.password);
            } catch (err: unknown) {
                const error = err as { code?: string };
                if (error.code === "auth/email-already-in-use") {
                    userCredential = await signInWithFirebaseEmail(normalizedEmail, user.password);
                } else {
                    throw err;
                }
            }

            const firebaseUser = userCredential.user;
            const idToken = await firebaseUser.getIdToken(true);
            const registrationResponse = await registerUser({
                idToken,
                user: { username: normalizedUsername, firstName: normalizedFirstName, lastName: normalizedLastName },
                locale,
            });

            let verificationEmailSent = false;
            if (!firebaseUser.emailVerified) {
                try {
                    await sendFirebaseEmailVerification();
                    verificationEmailSent = true;
                } catch {
                    // Account creation already succeeded; the user can retry from the account page.
                }
            }

            if (registrationResponse.userData) {
                setUserData(registrationResponse.userData);
            }
            addToast("Signup", "Account created successfully.");
            if (verificationEmailSent) {
                addToast("Verify your email", "We sent a verification link to your inbox.");
            } else if (registrationResponse.email_verified !== true) {
                addToast("Verify your email", "Account created. Check your inbox or resend the verification email from your account page.");
            }
            navigate("/");
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                const status = err.response?.status;
                const msg = getApiErrorMessage(err, "We couldn't create your account. Please try again.");
                setErrors([msg]);
                if (status === HTTP_STATUS.INTERNAL_SERVER_ERROR) {
                    addToast("Sign-up failed", "The account service is temporarily unavailable. Please try again later.");
                } else {
                    addToast("Sign-up failed", msg);
                }
            } else {
                const message = getFirebaseAuthErrorMessage(
                    err,
                    "We couldn't create your account right now. Check your details and try again.",
                );
                setErrors([message]);
                addToast("Sign-up failed", message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Helmet>
                <title>{t("auth.signupTitle")} | Digital-E</title>
                <meta name="description" content={t("auth.signupDescription")} />
            </Helmet>
            <AuthShell
                mode="signup"
                titleId="signup-title"
                eyebrow={t("auth.customerAccount")}
                title={t("auth.signupTitle")}
                description={t("auth.signupDescription")}
                storyTitle={t("auth.signupStoryTitle")}
                storyDescription={t("auth.signupStoryDescription")}
                footer={(
                    <p className="auth-form__switch">
                        {t("auth.alreadyRegistered")} <Link to="/login">{t("auth.login")}</Link>
                    </p>
                )}
            >
                <form
                    ref={formRef}
                    className="auth-form auth-form--signup"
                    onSubmit={handleSubmit}
                    name="signup-form"
                    aria-label="signup-form"
                    noValidate
                    aria-busy={isSubmitting}
                >
                    <div className="auth-form__name-fields">
                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-first-name">{t("auth.firstName")}</label>
                        <input
                            id="signup-first-name"
                            className="auth-form__input"
                            type="text"
                            name="firstName"
                            placeholder={t("auth.enterFirstName")}
                            required
                            maxLength={100}
                            autoComplete="given-name"
                            value={user.firstName}
                            onChange={handleChangeInput}
                            aria-invalid={Boolean(fieldErrors.firstName)}
                            aria-describedby={fieldErrors.firstName ? "signup-first-name-error" : undefined}
                        />
                        {fieldErrors.firstName ? <p id="signup-first-name-error" className="auth-form__field-error" role="alert">{fieldErrors.firstName}</p> : null}
                    </div>
                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-last-name">{t("auth.lastName")}</label>
                        <input
                            id="signup-last-name"
                            className="auth-form__input"
                            type="text"
                            name="lastName"
                            placeholder={t("auth.enterLastName")}
                            required
                            maxLength={100}
                            autoComplete="family-name"
                            value={user.lastName}
                            onChange={handleChangeInput}
                            aria-invalid={Boolean(fieldErrors.lastName)}
                            aria-describedby={fieldErrors.lastName ? "signup-last-name-error" : undefined}
                        />
                        {fieldErrors.lastName ? <p id="signup-last-name-error" className="auth-form__field-error" role="alert">{fieldErrors.lastName}</p> : null}
                    </div>
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-username">{t("auth.username")}</label>
                        <input
                            id="signup-username"
                            className="auth-form__input"
                            type="text"
                            name="username"
                            placeholder={t("auth.chooseUsername")}
                            required
                            autoComplete="username"
                            spellCheck={false}
                            value={user.username}
                            onChange={handleChangeInput}
                            aria-invalid={Boolean(fieldErrors.username)}
                            aria-describedby={fieldErrors.username ? "signup-username-error" : "signup-username-help"}
                        />
                        {fieldErrors.username ? <p id="signup-username-error" className="auth-form__field-error" role="alert">{fieldErrors.username}</p> : null}
                        {!fieldErrors.username ? <p id="signup-username-help" className="auth-form__field-help">{t("auth.usernameHint")}</p> : null}
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-email">{t("auth.emailAddress")}</label>
                        <input
                            id="signup-email"
                            className="auth-form__input"
                            type="email"
                            name="email"
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                            spellCheck={false}
                            value={user.email}
                            onChange={handleChangeInput}
                            aria-invalid={Boolean(fieldErrors.email)}
                            aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
                        />
                        {fieldErrors.email ? <p id="signup-email-error" className="auth-form__field-error" role="alert">{fieldErrors.email}</p> : null}
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-password">{t("auth.password")}</label>
                        <div className="auth-form__password-field">
                            <input
                                id="signup-password"
                                className="auth-form__input"
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder={t("auth.createPassword")}
                                required
                                autoComplete="new-password"
                                value={user.password}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={`signup-password-hint${fieldErrors.password ? " signup-password-error" : ""}`}
                            />
                            <button
                                className="auth-form__password-toggle"
                                type="button"
                                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
                                onClick={() => setShowPassword((value) => !value)}
                            >
                                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                        </div>
                        <p id="signup-password-hint" className="auth-form__password-hint">
                            {t("auth.passwordHint")}
                        </p>
                        <div
                            className="auth-form__password-meter"
                            role="progressbar"
                            aria-label={t("auth.passwordStrength", passwordStrength)}
                            aria-valuemin={0}
                            aria-valuemax={5}
                            aria-valuenow={passwordStrength}
                        >
                            {[1, 2, 3, 4, 5].map((level) => (
                                <span key={level} className={passwordStrength >= level ? "active" : ""}></span>
                            ))}
                        </div>
                        {fieldErrors.password ? <p id="signup-password-error" className="auth-form__field-error" role="alert">{fieldErrors.password}</p> : null}
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-confirm-password">{t("auth.confirmPassword")}</label>
                        <div className="auth-form__password-field">
                            <input
                                id="signup-confirm-password"
                                className="auth-form__input"
                                type={showConfirm ? "text" : "password"}
                                name="confirm"
                                placeholder={t("auth.reenterPassword")}
                                required
                                autoComplete="new-password"
                                value={user.confirm}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(confirmPasswordError)}
                                aria-describedby={confirmPasswordError ? "signup-confirm-password-error" : undefined}
                            />
                            <button
                                className="auth-form__password-toggle"
                                type="button"
                                aria-label={showConfirm ? t("auth.hideConfirmPassword") : t("auth.showConfirmPassword")}
                                onClick={() => setShowConfirm((value) => !value)}
                            >
                                {showConfirm ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                        </div>
                        {confirmPasswordError ? <p id="signup-confirm-password-error" className="auth-form__field-error" role="alert">{confirmPasswordError}</p> : null}
                    </div>

                    {fieldErrors.general ? (
                        <div className="auth-form__general-error" role="alert" aria-live="assertive">
                            {fieldErrors.general}
                        </div>
                    ) : null}

                    <button className="auth-form__submit" type="submit" disabled={isSubmitting || !hasRequiredFields || passwordsMismatch} aria-busy={isSubmitting}>
                        {isSubmitting ? t("auth.creatingAccount") : t("auth.signUp")}
                        <span aria-hidden="true">→</span>
                    </button>
                    <p className="auth-form__legal-note">{t("auth.verificationNote")}</p>
                </form>
            </AuthShell>
        </>
    );
};

export default SignupPage;
