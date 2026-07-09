import { AxiosError } from "axios";
import React, { useEffect, useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import authImage from "../../../assets/images/background_form.jpg";
import { useToast } from "../../../context/ToastContext";
import { createFirebaseUser, signInWithFirebaseEmail } from "../../../services/firebase";
import "../../../styles/features/auth/_signup.scss";
import { PAGE_IMAGE_WIDTHS, getResponsiveImageSource } from "../../../utils/images";
import { Role } from "../../../types/user";
import SocialAuthButtons from "../components/SocialAuthButtons";
import { getSocialAuthMessage } from "../utils/socialAuth";
import { EyeIcon, EyeOffIcon } from "../../../components/common/Icons";
import { registerUser } from "../api";

interface User {
    username: string;
    email: string;
    password: string;
    confirm: string;
    role: Role;
}

const SignupPage = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { addToast } = useToast();
    const [user, setUser] = useState<User>({
        username: "",
        email: "",
        password: "",
        confirm: "",
        role: Role.Customer,
    });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const fieldErrors = useMemo(() => {
        const map: Record<string, string> = {};
        for (const err of errors) {
            const lower = err.toLowerCase();
            if (lower.includes("username")) map.username = err;
            else if (lower.includes("email")) map.email = err;
            else if (lower.includes("password") && lower.includes("confirm")) map.confirm = err;
            else if (lower.includes("password")) map.password = err;
            else map.general = err;
        }
        return map;
    }, [errors]);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
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

    const canSubmit = useMemo(
        () =>
            user.username.trim().length > 0 &&
            user.email.trim().length > 0 &&
            user.password.length > 0 &&
            user.confirm.length > 0 &&
            !isSubmitting,
        [isSubmitting, user.confirm, user.email, user.password, user.username],
    );

    useEffect(() => {
        const message = getSocialAuthMessage(searchParams.get("socialAuth"));
        if (!message) {
            return;
        }

        setErrors([message]);
        addToast("Social signup", message);
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("socialAuth");
        setSearchParams(nextParams, { replace: true });
    }, [addToast, searchParams, setSearchParams]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (!user.username) {
            errorsList.push("Username is required");
        } else if (!usernamePattern.test(user.username)) {
            errorsList.push(
                "Username must be 3-15 characters long and contain only letters, numbers, periods, underscores, or hyphens.",
            );
        }
        if (!user.email) {
            errorsList.push("Email is required");
        } else if (!user.email.match(emailPattern)) {
            errorsList.push("Invalid email format");
        }
        if (!user.password) {
            errorsList.push("Password is required");
        } else if (!passwordPattern.test(user.password)) {
            errorsList.push(
                "Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character.",
            );
        } else if (!user.confirm) {
            errorsList.push("Confirm password is required");
        } else if (user.password !== user.confirm) {
            errorsList.push("Confirm password is not match");
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

    const handleChangeRadio = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedRole = event.target.value as Role;
        setUser({ ...user, role: selectedRole });
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
            let uid = "";
            try {
                const userCredential = await createFirebaseUser(user.email, user.password);
                uid = userCredential.user.uid;
            } catch (err: unknown) {
                const error = err as { code?: string };
                if (error.code === "auth/email-already-in-use") {
                    const userCredential = await signInWithFirebaseEmail(user.email, user.password);
                    uid = userCredential.user.uid;
                } else {
                    throw err;
                }
            }

            await registerUser(user, uid);
            addToast("Signup", "Account created successfully.");
            navigate(user.role === Role.Customer ? "/" : "/admin");
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                const status = err.response?.status;
                const msg = err.response?.data?.msg || "Unknown error";

                setErrors([msg]);

                if (status === 401) {
                    addToast("Signup failed", "Unauthorized. Please try again.");
                } else if (status === 500) {
                    addToast("Signup failed", "Server error. Please try again later.");
                } else if (status) {
                    addToast("Signup failed", msg);
                } else {
                    addToast("Signup failed", "Unable to create account.");
                }
            } else {
                setErrors(["An unexpected error occurred."]);
                addToast("Signup failed", "An unexpected error occurred.");
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
                        loading="lazy"
                        decoding="async"
                    />
                    <div className="signup__image__content">
                        <strong className="signup__image__content__name">DIGITAL-E</strong>
                        <p className="signup__image__content__desc">Create an account for faster checkout.</p>
                    </div>
                </aside>
                <main className="signup__form">
                    <h1 className="signup__form__title">Create account</h1>
                    <SocialAuthButtons intent="signup" role={user.role} disabled={user.role === Role.Admin} />
                    <Form className="signup__form__container" onSubmit={handleSubmit} name="signup-form" aria-label="signup-form">
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label>Username</Form.Label>
                            <Form.Control
                                type="text"
                                name="username"
                                placeholder="Username"
                                className={`signup__form__container__group__input${fieldErrors.username ? " is-invalid" : ""}`}
                                required
                                autoComplete="username"
                                value={user.username}
                                onChange={handleChangeInput}
                            />
                            {fieldErrors.username ? <Form.Text className="signup__field-error">{fieldErrors.username}</Form.Text> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicEmail">
                            <Form.Label>Email address</Form.Label>
                            <Form.Control
                                type="email"
                                name="email"
                                placeholder="Email"
                                className={`signup__form__container__group__input${fieldErrors.email ? " is-invalid" : ""}`}
                                required
                                autoComplete="email"
                                value={user.email}
                                onChange={handleChangeInput}
                            />
                            {fieldErrors.email ? <Form.Text className="signup__field-error">{fieldErrors.email}</Form.Text> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label>Password</Form.Label>
                            <div className="signup__password-field">
                                <Form.Control
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Password"
                                    className={`signup__form__container__group__input${fieldErrors.password ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="new-password"
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
                            <div className="signup__password-meter" aria-label="Password strength">
                                {[1, 2, 3, 4, 5].map((level) => (
                                    <span key={level} className={passwordStrength >= level ? "active" : ""}></span>
                                ))}
                            </div>
                            {fieldErrors.password ? <Form.Text className="signup__field-error">{fieldErrors.password}</Form.Text> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicConfirmPassword">
                            <Form.Label>Confirm Password</Form.Label>
                            <div className="signup__password-field">
                                <Form.Control
                                    type={showConfirm ? "text" : "password"}
                                    name="confirm"
                                    placeholder="Confirm Password"
                                    className={`signup__form__container__group__input${fieldErrors.confirm ? " is-invalid" : ""}`}
                                    required
                                    autoComplete="new-password"
                                    value={user.confirm}
                                    onChange={handleChangeInput}
                                />
                                <button
                                    type="button"
                                    aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                                    onClick={() => setShowConfirm((value) => !value)}
                                >
                                    {showConfirm ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                                </button>
                            </div>
                            {fieldErrors.confirm ? <Form.Text className="signup__field-error">{fieldErrors.confirm}</Form.Text> : null}
                        </Form.Group>
                        <Form.Group className="signup__form__container__group signup__role">
                            <Form.Label>Signup as</Form.Label>
                            <div className="signup__role__options">
                                {[Role.Customer, Role.Admin].map((role) => (
                                    <label key={role} className={user.role === role ? "active" : ""}>
                                        <input
                                            type="radio"
                                            name="signup-role"
                                            value={role}
                                            checked={user.role === role}
                                            onChange={handleChangeRadio}
                                        />
                                        {role}
                                    </label>
                                ))}
                            </div>
                        </Form.Group>

                        {fieldErrors.general ? (
                            <div className="signup__form__errors" aria-live="polite">
                                <div>{fieldErrors.general}</div>
                            </div>
                        ) : null}
                        <button className="signup__form__submit" type="submit" disabled={!canSubmit}>
                            {isSubmitting ? "Creating account..." : "Sign up"}
                        </button>
                        <div className="signup__form__switch">
                            Already registered? <Link to="/login">Login</Link>
                        </div>
                    </Form>
                </main>
            </div>
        </main>
    );
};

export default SignupPage;
