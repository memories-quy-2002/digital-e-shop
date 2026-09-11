import React, { useMemo, useState } from "react";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { Link, useLocation, useNavigate } from "react-router-dom";
import authImage from "../../../assets/images/background_form.jpg";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { signInWithFirebaseEmail } from "../../../services/firebase";
import "../../../styles/features/auth/_login.scss";
import { PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../../../utils/images";
import { Role } from "../../../types/user";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { loginUser } from "../api";
import { getSafeRedirectTarget } from "../authRedirect";

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
            if (lower.includes("email")) map.email = err;
            else if (lower.includes("password")) map.password = err;
            else map.general = err;
        }
        return map;
    }, [errors]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const authImageSource = getResponsiveImageSource(authImage, {
        widths: PAGE_IMAGE_WIDTHS,
        sizes: "(min-width: 960px) 42vw, 100vw",
        fit: "fill",
    });

    const canSubmit = useMemo(
        () => user.email.trim().length > 0 && user.password.length > 0 && !isSubmitting,
        [isSubmitting, user.email, user.password],
    );

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!user.email) {
            errorsList.push("Email is required");
        } else if (!user.email.match(emailPattern)) {
            errorsList.push("Invalid email format");
        }
        if (!user.password) {
            errorsList.push("Password is required");
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
            const userCredential = await signInWithFirebaseEmail(user.email, user.password);
            const idToken = await userCredential.user.getIdToken(true);
            const userDataResult = await loginUser({ idToken }, rememberMe);
            setUserData(userDataResult);
            addToast("Login", "You have been logon successfully");
            if (userDataResult?.email_verified === false) {
                addToast("Verify your email", "You can browse and manage your account, but checkout and reviews require verification.");
            }
            const requestedPath = getSafeRedirectTarget(new URLSearchParams(location.search).get("redirect"));
            const destination = userDataResult?.role === Role.Admin ? requestedPath || "/admin" : "/";
            navigate(destination, { replace: true });
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const axiosError = err as { response: { status: number; data: { msg: string } } };
                const status = axiosError.response.status;
                setErrors([axiosError.response.data.msg]);
                if (status === 401) {
                    addToast("Login failed", "Please check your credentials.");
                } else if (status === 500) {
                    addToast("Login failed", "Server error. Please try again later.");
                } else {
                    addToast("Login failed", "Unable to login. Please try again.");
                }
            } else {
                setErrors(["An unexpected error occurred."]);
                addToast("Login failed", "An unexpected error occurred.");
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
                        loading="lazy"
                        decoding="async"
                    />
                    <div className="login__image__content">
                        <strong className="login__image__content__name">DIGITAL-E</strong>
                        <p className="login__image__content__desc">Sign in to manage your orders and wishlist.</p>
                    </div>
                </aside>
                <main className="login__form">
                    <h1 className="login__form__title">Welcome back</h1>
                    <Form className="login__form__container" onSubmit={handleSubmit} name="login-form" aria-label="login-form">
                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label>Email</Form.Label>
                            <Form.Control
                                type="email"
                                name="email"
                                placeholder="Email"
                                className={`login__form__container__group__input${fieldErrors.email ? " is-invalid" : ""}`}
                                required
                                autoComplete="email"
                                value={user.email}
                                onChange={handleChangeInput}
                            />
                            {fieldErrors.email ? <Form.Text className="login__field-error">{fieldErrors.email}</Form.Text> : null}
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label>Password</Form.Label>
                            <div className="login__password-field">
                                <Form.Control
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Password"
                                    className={`login__form__container__group__input${fieldErrors.password ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="current-password"
                                    value={user.password}
                                    onChange={handleChangeInput}
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    onClick={() => setShowPassword((value) => !value)}
                                >
                                    {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {fieldErrors.password ? <Form.Text className="login__field-error">{fieldErrors.password}</Form.Text> : null}
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
                            <div className="login__form__errors" aria-live="polite">
                                <div>{fieldErrors.general}</div>
                            </div>
                        ) : null}
                        <button className="login__form__submit" name="login" type="submit" disabled={!canSubmit}>
                            {isSubmitting ? "Signing in..." : "Login"}
                        </button>
                        <div className="login__form__switch">
                            Don&apos;t have an account? <Link to="/signup">Register</Link>
                        </div>
                    </Form>
                </main>
            </div>
        </main>
    );
};

export default LoginPage;
