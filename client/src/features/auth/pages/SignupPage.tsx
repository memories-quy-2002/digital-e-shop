import { AxiosError } from "axios";
import React, { useEffect, useMemo, useRef, useState } from "react";
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

interface User {
    username: string;
    email: string;
    password: string;
    confirm: string;
}

const SignupPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { setUserData } = useAuth();
    const [user, setUser] = useState<User>({ username: "", email: "", password: "", confirm: "" });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const formRef = useRef<HTMLFormElement | null>(null);

    const fieldErrors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const err of errors) {
            const lower = err.toLowerCase();
            if (lower.includes("match") && lower.includes("password")) map.confirm = err;
            else if (lower.includes("username")) map.username = err;
            else if (lower.includes("email") && !lower.includes("password")) map.email = err;
            else if (lower.includes("password") && lower.includes("confirm")) map.confirm = err;
            else if (lower.includes("password") && !lower.includes("email")) map.password = err;
            else map.general = err;
        }
        return map;
    }, [errors]);

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

    useEffect(() => {
        if (errors.length === 0) return;
        formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        const normalizedUsername = user.username.trim();
        const normalizedEmail = user.email.trim();

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
            errorsList.push("Passwords do not match.");
        }
        return errorsList;
    };

    const clearFieldError = (field: keyof User) => {
        setErrors((current) => current.filter((err) => {
            const lower = err.toLowerCase();
            if (field === "username") return !lower.includes("username");
            if (field === "email") return !lower.includes("email");
            if (field === "password") {
                return !lower.includes("password") || (lower.includes("match") && lower.includes("password"));
            }
            if (field === "confirm") return !(lower.includes("confirm") || lower.includes("match"));
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
            const registrationResponse = await registerUser({ idToken, user: { username: normalizedUsername } });

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
                if (status === 500) {
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
                <title>Create Account | Digital-E</title>
                <meta name="description" content="Create a Digital-E account to shop faster and track orders." />
            </Helmet>
            <AuthShell
                mode="signup"
                titleId="signup-title"
                eyebrow="Customer account"
                title="Create account"
                description="Make your next build easier to manage from the first component to the final order."
                storyTitle="Make every build count."
                storyDescription="Keep your parts list, order history, and saved details ready whenever inspiration strikes."
                footer={(
                    <p className="auth-form__switch">
                        Already registered? <Link to="/login">Log in</Link>
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
                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-username">Username</label>
                        <input
                            id="signup-username"
                            className="auth-form__input"
                            type="text"
                            name="username"
                            placeholder="Choose a username"
                            required
                            autoComplete="username"
                            spellCheck={false}
                            value={user.username}
                            onChange={handleChangeInput}
                            aria-invalid={Boolean(fieldErrors.username)}
                            aria-describedby={fieldErrors.username ? "signup-username-error" : undefined}
                        />
                        {fieldErrors.username ? <p id="signup-username-error" className="auth-form__field-error" role="alert">{fieldErrors.username}</p> : null}
                    </div>

                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="signup-email">Email address</label>
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
                        <label className="auth-form__label" htmlFor="signup-password">Password</label>
                        <div className="auth-form__password-field">
                            <input
                                id="signup-password"
                                className="auth-form__input"
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Create a password"
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
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                onClick={() => setShowPassword((value) => !value)}
                            >
                                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                        </div>
                        <p id="signup-password-hint" className="auth-form__password-hint">
                            Use 8+ characters with lowercase, uppercase, a number, and a symbol.
                        </p>
                        <div
                            className="auth-form__password-meter"
                            role="progressbar"
                            aria-label={`Password strength: ${passwordStrength} of 5`}
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
                        <label className="auth-form__label" htmlFor="signup-confirm-password">Confirm Password</label>
                        <div className="auth-form__password-field">
                            <input
                                id="signup-confirm-password"
                                className="auth-form__input"
                                type={showConfirm ? "text" : "password"}
                                name="confirm"
                                placeholder="Re-enter your password"
                                required
                                autoComplete="new-password"
                                value={user.confirm}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.confirm)}
                                aria-describedby={fieldErrors.confirm ? "signup-confirm-password-error" : undefined}
                            />
                            <button
                                className="auth-form__password-toggle"
                                type="button"
                                aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                                onClick={() => setShowConfirm((value) => !value)}
                            >
                                {showConfirm ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                            </button>
                        </div>
                        {fieldErrors.confirm ? <p id="signup-confirm-password-error" className="auth-form__field-error" role="alert">{fieldErrors.confirm}</p> : null}
                    </div>

                    {fieldErrors.general ? (
                        <div className="auth-form__general-error" role="alert" aria-live="assertive">
                            {fieldErrors.general}
                        </div>
                    ) : null}

                    <button className="auth-form__submit" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                        {isSubmitting ? "Creating account…" : "Sign up"}
                        <span aria-hidden="true">→</span>
                    </button>
                    <p className="auth-form__legal-note">We&apos;ll send a verification link after your account is created.</p>
                </form>
            </AuthShell>
        </>
    );
};

export default SignupPage;
