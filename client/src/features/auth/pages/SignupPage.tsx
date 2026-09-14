import { AxiosError } from "axios";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import authImage from "../../../assets/images/background_form.jpg";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { createFirebaseUser, sendFirebaseEmailVerification, signInWithFirebaseEmail } from "../../../services/firebase";
import "../../../styles/features/auth/_signup.scss";
import { PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../../../utils/images";
import type { UserCredential } from "firebase/auth";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { registerUser } from "../api";
import { getFirebaseAuthErrorMessage } from "../authErrors";
import { setFirebaseAuthPersistence } from "../../../services/firebasePersistence";

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
    const [user, setUser] = useState<User>({
        username: "",
        email: "",
        password: "",
        confirm: "",
    });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const formSectionRef = useRef<HTMLElement | null>(null);
    const authImageSource = getResponsiveImageSource(authImage, {
        widths: PAGE_IMAGE_WIDTHS,
        sizes: "(min-width: 960px) 42vw, 100vw",
        fit: "fill",
    });

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

        formSectionRef.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus();
    }, [errors]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!user.username.trim()) {
            errorsList.push("Enter a username.");
        } else if (!usernamePattern.test(user.username)) {
            errorsList.push(
                "Username must be 3-15 characters long and contain only letters, numbers, periods, underscores, or hyphens.",
            );
        }
        if (!user.email) {
            errorsList.push("Enter your email address.");
        } else if (!emailPattern.test(user.email.trim())) {
            errorsList.push("Enter a valid email address.");
        }
        if (!user.password) {
            errorsList.push("Choose a password.");
        } else if (!passwordPattern.test(user.password)) {
            errorsList.push(
                "Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character.",
            );
        }
        if (!user.confirm) {
            errorsList.push("Confirm your password.");
        } else if (user.password !== user.confirm) {
            errorsList.push("Passwords do not match.");
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
                    // Account creation already succeeded; the signed-in user can retry from the account page.
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
                const msg = err.response?.data?.msg || err.response?.data?.error || "We couldn't create your account. Please try again.";

                setErrors([msg]);

                if (status === 401) {
                    addToast("Sign-up failed", "The account service rejected the request. Please try again.");
                } else if (status === 500) {
                    addToast("Sign-up failed", "The account service is temporarily unavailable. Please try again later.");
                } else if (status) {
                    addToast("Sign-up failed", msg);
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
        <main className="auth-page">
            <Helmet>
                <title>Create Account | Digital-E</title>
                <meta name="description" content="Create a Digital-E account to shop faster and track orders." />
            </Helmet>
            <div className="signup">
                <aside className="signup__image">
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
                    <div className="signup__image__content">
                        <strong className="signup__image__content__name">DIGITAL-E</strong>
                        <p className="signup__image__content__desc">Create an account for faster checkout.</p>
                    </div>
                </aside>
                <section ref={formSectionRef} className="signup__form" aria-labelledby="signup-title">
                    <Link className="signup__form__back-link" to="/">← Back to store</Link>
                    <h1 id="signup-title" className="signup__form__title">Create account</h1>
                    <Form
                        className="signup__form__container"
                        onSubmit={handleSubmit}
                        name="signup-form"
                        aria-label="signup-form"
                        noValidate
                        aria-busy={isSubmitting}
                    >
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label htmlFor="signup-username">Username</Form.Label>
                            <Form.Control
                                id="signup-username"
                                type="text"
                                name="username"
                                placeholder="Choose a username…"
                                className={`signup__form__container__group__input${fieldErrors.username ? " is-invalid" : ""}`}
                                required
                                autoComplete="username"
                                spellCheck={false}
                                value={user.username}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.username)}
                                aria-describedby={fieldErrors.username ? "signup-username-error" : undefined}
                            />
                            {fieldErrors.username ? <div id="signup-username-error" className="signup__field-error" role="alert">{fieldErrors.username}</div> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicEmail">
                            <Form.Label htmlFor="signup-email">Email address</Form.Label>
                            <Form.Control
                                id="signup-email"
                                type="email"
                                name="email"
                                placeholder="you@example.com…"
                                className={`signup__form__container__group__input${fieldErrors.email ? " is-invalid" : ""}`}
                                required
                                autoComplete="email"
                                spellCheck={false}
                                value={user.email}
                                onChange={handleChangeInput}
                                aria-invalid={Boolean(fieldErrors.email)}
                                aria-describedby={fieldErrors.email ? "signup-email-error" : undefined}
                            />
                            {fieldErrors.email ? <div id="signup-email-error" className="signup__field-error" role="alert">{fieldErrors.email}</div> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label htmlFor="signup-password">Password</Form.Label>
                            <div className="signup__password-field">
                                <Form.Control
                                    id="signup-password"
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Create a password…"
                                    className={`signup__form__container__group__input${fieldErrors.password ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="new-password"
                                    value={user.password}
                                    onChange={handleChangeInput}
                                    aria-invalid={Boolean(fieldErrors.password)}
                                    aria-describedby={`signup-password-hint${fieldErrors.password ? " signup-password-error" : ""}`}
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    onClick={() => setShowPassword((value) => !value)}
                                >
                                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            <p id="signup-password-hint" className="signup__password-hint">
                                Use 8+ characters with upper/lowercase, a number, and a symbol.
                            </p>
                            <div
                                className="signup__password-meter"
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
                            {fieldErrors.password ? <div id="signup-password-error" className="signup__field-error" role="alert">{fieldErrors.password}</div> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicConfirmPassword">
                            <Form.Label htmlFor="signup-confirm-password">Confirm Password</Form.Label>
                            <div className="signup__password-field">
                                <Form.Control
                                    id="signup-confirm-password"
                                    type={showConfirm ? "text" : "password"}
                                    name="confirm"
                                    placeholder="Re-enter your password…"
                                    className={`signup__form__container__group__input${fieldErrors.confirm ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="new-password"
                                    value={user.confirm}
                                    onChange={handleChangeInput}
                                    aria-invalid={Boolean(fieldErrors.confirm)}
                                    aria-describedby={fieldErrors.confirm ? "signup-confirm-password-error" : undefined}
                                />
                                <button
                                    type="button"
                                    aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                                    onClick={() => setShowConfirm((value) => !value)}
                                >
                                    {showConfirm ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {fieldErrors.confirm ? <div id="signup-confirm-password-error" className="signup__field-error" role="alert">{fieldErrors.confirm}</div> : null}
                        </Form.Group>
                        {fieldErrors.general ? (
                            <div id="signup-form-error" className="signup__form__errors" role="alert" aria-live="assertive">
                                <div>{fieldErrors.general}</div>
                            </div>
                        ) : null}
                        <button className="signup__form__submit" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Creating account…" : "Sign up"}
                        </button>
                        <div className="signup__form__switch">
                            Already registered? <Link to="/login">Login</Link>
                        </div>
                    </Form>
                </section>
            </div>
        </main>
    );
};

export default SignupPage;
