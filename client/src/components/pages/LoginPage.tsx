import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useMemo, useState } from "react";
import { Form } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { auth } from "../../services/firebase";
import "../../styles/LoginPage.scss";
import { Role } from "../../utils/interface";
import { Helmet } from "react-helmet";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { EyeIcon, EyeOffIcon, ShieldIcon } from "../common/Icons";
interface User {
    email: string;
    password: string;
    role: Role;
}
const LoginPage = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [user, setUser] = useState<User>({
        email: "",
        password: "",
        role: Role.Customer,
    });
    const { setUserData } = useAuth();
    const [rememberMe, setRememberMe] = useState<boolean>(false);
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [showPassword, setShowPassword] = useState<boolean>(false);

    const canSubmit = useMemo(
        () => user.email.trim().length > 0 && user.password.length > 0 && !isSubmitting,
        [isSubmitting, user.email, user.password],
    );

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
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
    const handleChangeRadio = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedRole = event.target.value as Role;
        setUser({ ...user, role: selectedRole });
    };
    const handleChangeCheckbox = () => {
        setRememberMe((rememberMe) => !rememberMe);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const errors = validateForm(); // Capture validation errors
        if (errors.length > 0) {
            setErrors(errors); // Display errors, no need to proceed further
            return;
        }
        setIsSubmitting(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
            const uid = userCredential.user.uid;
            const response = await axios.post("/api/users/login", {
                uid,
                role: user.role,
                rememberMe,
            });

            if (response.status === 200) {
                setUserData(response.data.userData);
                addToast("Login", "You have been logon successfully");
                if (user.role === Role.Admin) {
                    navigate("/admin");
                } else {
                    navigate("/");
                }
            }
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
            } else if (err instanceof Error) {
                setErrors(["An unexpected error occurred."]);
                addToast("Login failed", "An unexpected error occurred.");
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
                    <div className="login__image__content">
                        <strong className="login__image__content__name">DIGITAL-E</strong>
                        <p className="login__image__content__desc">Fast checkout, saved carts, and order tracking.</p>
                        <div className="login__image__content__trust">
                            <span>Secure sessions</span>
                            <span>Saved carts</span>
                            <span>Order history</span>
                        </div>
                    </div>
                </aside>
                <main className="login__form">
                    <div className="login__form__badge">
                        <ShieldIcon size={18} />
                        Protected account access
                    </div>
                    <h1 className="login__form__title">Welcome back</h1>
                    <p className="login__form__subtitle">Sign in to continue shopping with your saved preferences.</p>
                    <Form
                        className="login__form__container"
                        onSubmit={handleSubmit}
                        name="login-form"
                        aria-label="login-form"
                    >
                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label>Email</Form.Label>
                            <Form.Control
                                type="email"
                                name="email"
                                placeholder="Email"
                                className="login__form__container__group__input"
                                required
                                autoComplete="email"
                                value={user.email}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label>Password</Form.Label>
                            <div className="login__password-field">
                                <Form.Control
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    placeholder="Password"
                                    className="login__form__container__group__input"
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
                        </Form.Group>

                        <Form.Group className="login__form__container__group login__role">
                            <Form.Label>Login as</Form.Label>
                            <div className="login__role__options">
                                {[Role.Customer, Role.Admin].map((role) => (
                                    <label key={role} className={user.role === role ? "active" : ""}>
                                        <input
                                            type="radio"
                                            name="login-role"
                                            value={role}
                                            checked={user.role === role}
                                            onChange={handleChangeRadio}
                                        />
                                        {role}
                                    </label>
                                ))}
                            </div>
                        </Form.Group>
                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicCheckbox">
                            <Form.Check
                                inline
                                type="checkbox"
                                name="signup-role"
                                checked={rememberMe === true}
                                onChange={handleChangeCheckbox}
                                label="Remember me"
                            />
                        </Form.Group>
                        <div className="login__form__errors" aria-live="polite">
                            {errors.map((error, id) => (
                                <div key={id}>
                                    {error}
                                </div>
                            ))}
                        </div>
                        <button
                            className="login__form__submit"
                            name="login"
                            type="submit"
                            disabled={!canSubmit}
                        >
                            {isSubmitting ? "Signing in..." : "Login"}
                        </button>
                        <div className="login__form__switch">
                            Don't have an account? <Link to="/signup">Register</Link>
                        </div>
                    </Form>
                </main>
            </div>
        </main>
    );
};
export default LoginPage;
