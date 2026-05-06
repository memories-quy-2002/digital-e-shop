import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Form } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { auth } from "../../services/firebase";
import "../../styles/SignupPage.scss";
import { Role } from "../../utils/interface";
import { Helmet } from "react-helmet";
import { AxiosError } from "axios";
import { useToast } from "../../context/ToastContext";

interface User {
    username: string;
    email: string;
    password: string;
    confirm: string;
    role: Role;
}
const SignupPage = () => {
    const navigate = useNavigate();
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

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/; // Allow letters, numbers, ., _, -, length 3-15
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (!user.username) {
            errorsList.push("Username is required");
        } else if (!usernamePattern.test(user.username)) {
            errorsList.push(
                "Username must be 3-15 characters long and contain only letters, numbers, periods, underscores, or hyphens."
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
                "Password must be at least 8 characters long, contain at least one lowercase letter, one uppercase letter, one number, and one special character."
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
        const errorsList: string[] = validateForm();

        if (errorsList.length > 0) {
            setErrors(errorsList); // Display errors, no need to proceed further
            return;
        } else {
            setIsSubmitting(true);
            try {
                let uid = "";
                try {
                    const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
                    uid = userCredential.user.uid;
                } catch (err: unknown) {
                    const error = err as { code?: string; message?: string };
                    if (error.code === "auth/email-already-in-use") {
                        const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
                        uid = userCredential.user.uid;
                    } else {
                        throw err;
                    }
                }

                const response = await axios.post("/api/users/register", {
                    user,
                    uid,
                });
                if (response.status === 200) {
                    addToast("Signup", "Account created successfully.");
                    if (user.role === Role.Customer) {
                        navigate("/");
                    } else if (user.role === Role.Admin) {
                        navigate("/admin");
                    }
                }
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
                } else if (err instanceof Error) {
                    setErrors(["An unexpected error occurred."]);
                    addToast("Signup failed", "An unexpected error occurred.");
                } else {
                    setErrors(["An unexpected error occurred."]);
                    addToast("Signup failed", "An unexpected error occurred.");
                }
            } finally {
                setIsSubmitting(false);
            }
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
                    <div className="signup__image__content">
                        <strong className="signup__image__content__name">DIGITAL-E</strong>
                        <p className="signup__image__content__desc">Create an account for faster checkout.</p>
                    </div>
                </aside>
                <main className="signup__form">
                    <h1 className="signup__form__title">Create new account</h1>
                    <p className="signup__form__subtitle">Save your cart, wishlist products, and track orders.</p>
                    <Form
                        className="signup__form__container"
                        onSubmit={handleSubmit}
                        name="signup-form"
                        aria-label="signup-form"
                    >
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicUserName">
                            <Form.Label>Username</Form.Label>
                            <Form.Control
                                type="text"
                                name="username"
                                placeholder="Username"
                                className="signup__form__container__group__input"
                                required
                                autoComplete="username"
                                value={user.username}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicEmail">
                            <Form.Label>Email address</Form.Label>
                            <Form.Control
                                type="email"
                                name="email"
                                placeholder="Email"
                                className="signup__form__container__group__input"
                                required
                                autoComplete="email"
                                value={user.email}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>
                        <Form.Group className="signup__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                name="password"
                                placeholder="Password"
                                className="signup__form__container__group__input"
                                required
                                autoComplete="new-password"
                                value={user.password}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>
                        <Form.Group
                            className="signup__form__container__group mb-3"
                            controlId="formBasicConfirmPassword"
                        >
                            <Form.Label>Confirm Password</Form.Label>
                            <Form.Control
                                type="password"
                                name="confirm"
                                placeholder="Confirm Password"
                                className="signup__form__container__group__input"
                                required
                                autoComplete="new-password"
                                value={user.confirm}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>
                        <Form.Group className="signup__form__container__group signup__role">
                            <Form.Label>Signup as:</Form.Label>
                            <Form.Check
                                inline
                                type="radio"
                                name="signup-role"
                                id="customer-radio"
                                value={Role.Customer}
                                checked={user.role === Role.Customer}
                                onChange={handleChangeRadio}
                            />
                            <Form.Label htmlFor="customer-radio" className="me-3">
                                Customer
                            </Form.Label>

                            <Form.Check
                                inline
                                type="radio"
                                name="signup-role"
                                id="admin-radio"
                                value={Role.Admin}
                                checked={user.role === Role.Admin}
                                onChange={handleChangeRadio}
                            />
                            <Form.Label htmlFor="admin-radio">Admin</Form.Label>
                        </Form.Group>

                        <div className="signup__form__errors" aria-live="polite">
                            {errors.map((error, id) => (
                                <div key={id}>
                                    {error}
                                </div>
                            ))}
                        </div>
                        <button
                            className="signup__form__submit"
                            type="submit"
                            disabled={isSubmitting}
                        >
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
