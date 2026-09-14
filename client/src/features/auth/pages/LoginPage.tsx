import React, { useEffect, useMemo, useRef, useState } from "react";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
import authImage from "../../../assets/images/background_form.jpg";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { setFirebaseAuthPersistence } from "../../../services/firebasePersistence";
import { signInWithFirebaseEmail } from "../../../services/firebase";
import "../../../styles/features/auth/_login.scss";
import { PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../../../utils/images";
import { Role } from "../../../types/user";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { loginUser } from "../api";
import { getSafeRedirectTarget } from "../authRedirect";
import { getFirebaseAuthErrorMessage } from "../authErrors";

interface User {
    email: string;
    password: string;
}

const LoginPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const [user, setUser] = useState<User>({
        email: "",
        password: "",
    });
    const { setUserData } = useAuth();
    const [rememberMe, setRememberMe] = useState<boolean>(false);
    const [errors, setErrors] = useState<string[]>([]);
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
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const formSectionRef = useRef<HTMLElement | null>(null);
    const authImageSource = getResponsiveImageSource(authImage, {
        widths: PAGE_IMAGE_WIDTHS,
        sizes: "(min-width: 960px) 42vw, 100vw",
        fit: "fill",
    });

    useEffect(() => {
        if (errors.length === 0) return;

        formSectionRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!user.email) {
            errorsList.push("Enter your email address.");
        } else if (!user.email.match(emailPattern)) {
            errorsList.push("Enter a valid email address.");
        }
        if (!user.password) {
            errorsList.push("Enter your password.");
        }
        return errorsList;
    };

    const handleChangeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setUser({ ...user, [name]: value });
        if (errors.length > 0) {
            setErrors([]);
        }
    };

    const handleChangeCheckbox = () => {
        setRememberMe((current) => !current);
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
            const userCredential = await signInWithFirebaseEmail(user.email, user.password);
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
                if (status === 401) {
                    addToast("Sign-in failed", "Firebase accepted your credentials, but Digital-E could not create a session. Try again.");
                } else if (status === 500) {
                    addToast("Sign-in failed", message);
                } else {
                    addToast("Sign-in failed", message);
                }
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
        <main className="auth-page">
            <Helmet>
                <title>Login | Digital-E</title>
                <meta name="description" content="Log in to manage your orders, wishlist, and account." />
            </Helmet>
            <div className="login">
                <aside className="login__image">
                    <img
                        src={authImageSource.src}
                        srcSet={authImageSource.srcSet}
                        sizes={authImageSource.sizes}
                        alt=""
                        aria-hidden="true"
                        loading="eager"
                        decoding="async"
                        width={1280}
                        height={853}
                    />
                    <div className="login__image__content">
                        <strong className="login__image__content__name">DIGITAL-E</strong>
                        <p className="login__image__content__desc">Sign in to manage your orders and wishlist.</p>
                    </div>
                </aside>
                <section ref={formSectionRef} className="login__form" aria-labelledby="login-title">
                    <Link className="login__form__back-link" to="/">← Back to store</Link>
                    <h1 id="login-title" className="login__form__title">Welcome back</h1>
                    <Form
                        className="login__form__container"
                        onSubmit={handleSubmit}
                        name="login-form"
                        aria-label="login-form"
                        noValidate
                        aria-busy={isSubmitting}
                    >
                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label htmlFor="login-email">Email</Form.Label>
                            <Form.Control
                                id="login-email"
                                type="email"
                                name="email"
                                placeholder="you@example.com…"
                                className={`login__form__container__group__input${fieldErrors.email ? " is-invalid" : ""}`}
                                required
                                autoComplete="email"
                                spellCheck={false}
                                value={user.email}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.email)}
                                aria-describedby={fieldErrors.email ? "login-email-error" : undefined}
                            />
                            {fieldErrors.email ? <div id="login-email-error" className="login__field-error" role="alert">{fieldErrors.email}</div> : null}
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label htmlFor="login-password">Password</Form.Label>
                            <div className="login__password-field">
                                <Form.Control
                                    id="login-password"
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Enter your password…"
                                    className={`login__form__container__group__input${fieldErrors.password ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="current-password"
                                    value={user.password}
                                    onChange={handleChangeInput}
                                    aria-invalid={Boolean(fieldErrors.password)}
                                    aria-describedby={fieldErrors.password ? "login-password-error" : undefined}
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    onClick={() => setShowPassword((value) => !value)}
                                >
                                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {fieldErrors.password ? <div id="login-password-error" className="login__field-error" role="alert">{fieldErrors.password}</div> : null}
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicCheckbox">
                            <Form.Check
                                inline
                                type="checkbox"
                                name="remember-me"
                                checked={rememberMe === true}
                                onChange={handleChangeCheckbox}
                                label="Remember me"
                            />
                        </Form.Group>
                        <div className="login__form__switch login__form__forgot">
                            <Link to="/forgot-password">Forgot password?</Link>
                        </div>
                        {fieldErrors.general ? (
                            <div id="login-form-error" className="login__form__errors" role="alert" aria-live="assertive">
                                <div>{fieldErrors.general}</div>
                            </div>
                        ) : null}
                        <button className="login__form__submit" name="login" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Signing in…" : "Login"}
                        </button>
                        <div className="login__form__switch">
                            Don&apos;t have an account? <Link to="/signup">Register</Link>
                        </div>
                    </Form>
                </section>
            </div>
        </main>
    );
};

export default LoginPage;
