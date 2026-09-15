import React, { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { Role } from "../../../types/user";
import { setFirebaseAuthPersistence } from "../../../services/firebasePersistence";
import { signInWithFirebaseEmail } from "../../../services/firebase";
import { loginUser } from "../api";
import AuthShell from "../components/AuthShell";
import { getFirebaseAuthErrorMessage } from "../authErrors";
import { getSafeRedirectTarget } from "../authRedirect";

interface User {
    email: string;
    password: string;
}

const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const { setUserData } = useAuth();
    const [user, setUser] = useState<User>({ email: "", password: "" });
    const [rememberMe, setRememberMe] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const formRef = useRef<HTMLFormElement | null>(null);

    const fieldErrors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const err of errors) {
            const lower = err.toLowerCase();
            if (lower.includes("email") && !lower.includes("password")) map.email = err;
            else if (lower.includes("password") && !lower.includes("email")) map.password = err;
            else map.general = err;
        }
        return map;
    }, [errors]);

    useEffect(() => {
        if (errors.length === 0) return;
        formRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        const normalizedEmail = user.email.trim();

        if (!normalizedEmail) {
            errorsList.push("Enter your email address.");
        } else if (!emailPattern.test(normalizedEmail)) {
            errorsList.push("Enter a valid email address.");
        }
        if (!user.password) {
            errorsList.push("Enter your password.");
        }
        return errorsList;
    };

    const clearFieldError = (field: keyof User) => {
        setErrors((current) => current.filter((err) => {
            const lower = err.toLowerCase();
            if (field === "email") return !lower.includes("email") || lower.includes("password");
            if (field === "password") return !lower.includes("password");
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

        const validationErrors = validateForm();
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }

        setIsSubmitting(true);
        try {
            await setFirebaseAuthPersistence(rememberMe);
            const userCredential = await signInWithFirebaseEmail(user.email.trim(), user.password);
            const idToken = await userCredential.user.getIdToken(true);
            const userDataResult = await loginUser({ idToken }, rememberMe);
            setUserData(userDataResult);
            addToast("Signed in", "You are now signed in to Digital-E.");
            if (userDataResult?.email_verified === false) {
                addToast("Verify your email", "You can browse and manage your account, but checkout and reviews require verification.");
            }

            const requestedPath = getSafeRedirectTarget(new URLSearchParams(location.search).get("redirect"));
            const isAdminPath = Boolean(requestedPath && /^\/admin(?:\/|$)/.test(requestedPath));
            const destination = userDataResult?.role === Role.Admin
                ? requestedPath || "/admin"
                : requestedPath && !isAdminPath
                    ? requestedPath
                    : "/";
            navigate(destination, { replace: true });
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const axiosError = err as { response?: { status?: number; data?: { msg?: string; error?: string } } };
                const status = axiosError.response?.status;
                const responseMessage = axiosError.response?.data?.msg || axiosError.response?.data?.error;
                const message = status === 500
                    ? "The account service is temporarily unavailable. Please try again later."
                    : responseMessage || "We couldn't complete sign in. Please try again.";
                setErrors([message]);
                addToast("Sign-in failed", message);
            } else {
                const message = getFirebaseAuthErrorMessage(
                    err,
                    "We couldn't sign you in right now. Check your details and try again.",
                );
                setErrors([message]);
                addToast("Sign-in failed", message);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <Helmet>
                <title>Login | Digital-E</title>
                <meta name="description" content="Log in to manage your orders, wishlist, and account." />
            </Helmet>
            <AuthShell
                mode="login"
                titleId="login-title"
                eyebrow="Customer account"
                title="Welcome back"
                description="Sign in to pick up where you left off."
                storyTitle="Your next build starts here."
                storyDescription="Save your setups, move through checkout faster, and keep every component order in one place."
                footer={(
                    <p className="auth-form__switch">
                        Don&apos;t have an account? <Link to="/signup">Create an account</Link>
                    </p>
                )}
            >
                <form
                    ref={formRef}
                    className="auth-form auth-form--login"
                    onSubmit={handleSubmit}
                    name="login-form"
                    aria-label="login-form"
                    noValidate
                    aria-busy={isSubmitting}
                >
                    <div className="auth-form__field">
                        <label className="auth-form__label" htmlFor="login-email">Email</label>
                        <input
                            id="login-email"
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
                            aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                        />
                        {fieldErrors.email ? <p id="login-email-error" className="auth-form__field-error" role="alert">{fieldErrors.email}</p> : null}
                    </div>

                    <div className="auth-form__field">
                        <div className="auth-form__label-row">
                            <label className="auth-form__label" htmlFor="login-password">Password</label>
                            <Link className="auth-form__link" to="/forgot-password">Forgot password?</Link>
                        </div>
                        <div className="auth-form__password-field">
                            <input
                                id="login-password"
                                className="auth-form__input"
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Enter your password"
                                required
                                autoComplete="current-password"
                                value={user.password}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.password)}
                                aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
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
                        {fieldErrors.password ? <p id="login-password-error" className="auth-form__field-error" role="alert">{fieldErrors.password}</p> : null}
                    </div>

                    <div className="auth-form__meta">
                        <label className="auth-form__checkbox">
                            <input
                                type="checkbox"
                                name="remember-me"
                                checked={rememberMe}
                                onChange={() => setRememberMe((current) => !current)}
                            />
                            <span>Remember me</span>
                        </label>
                    </div>

                    {fieldErrors.general ? (
                        <div className="auth-form__general-error" role="alert" aria-live="assertive">
                            {fieldErrors.general}
                        </div>
                    ) : null}

                    <button className="auth-form__submit" name="login" type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
                        {isSubmitting ? "Signing in…" : "Login"}
                        <span aria-hidden="true">→</span>
                    </button>
                </form>
            </AuthShell>
        </>
    );
};

export default LoginPage;
