import { signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import { auth } from "../../services/firebase";
import "../../styles/LoginPage.scss";
import { Role } from "../../utils/interface";
import { Helmet } from "react-helmet";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import backgroundForm from "../../assets/images/background_form.jpg";
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
    const authContext = useAuth();
    const [rememberMe, setRememberMe] = useState<boolean>(false);
    const [errors, setErrors] = useState<string[]>([]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
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
        }
        return errorsList;
    };

    const handleChangeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setUser({ ...user, [name]: value });
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
        try {
            console.log(user);
            const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
            const uid = userCredential.user.uid;
            const response = await axios.post("/api/users/login", {
                uid,
                role: user.role,
            });

            if (response.status === 200) {
                authContext.setUserData(response.data.userData);
                const token = response.data.token;
                const cookies = new Cookies();
                const cookieData = {
                    uid,
                    token,
                };
                if (rememberMe) {
                    cookies.set("rememberMe", JSON.stringify(cookieData), {
                        httpOnly: false,
                        // Consider using Secure flag if using HTTPS
                        maxAge: 1000 * 60 * 60 * 24 * 30,
                    });
                } else {
                    sessionStorage.setItem("rememberMe", JSON.stringify(cookieData));
                }
                addToast("Login", "You have been logon successfully");
                if (user.role === Role.Admin) {
                    navigate("/admin");
                } else {
                    navigate("/");
                }
                window.location.reload();
            }
        } catch (err: any) {
            if (err.response) {
                // Handle specific status codes
                const status = err.response.status;
                setErrors([err.response.data.msg]);
                if (status === 401) {
                    // Handle 401 Unauthorized
                    console.error("Unauthorized access. Please check your credentials.");
                } else if (status === 500) {
                    // Handle 500 Internal Server Error
                    console.error("Internal Server Error. Please try again later.");
                } else {
                    // Handle other errors
                    console.error(`Error: ${err.response.status}`);
                }
            } else {
                // Handle non-Axios errors
                console.error(err.message);
                setErrors(["An unexpected error occurred."]);
            }
        }
    };

    return (
        <Container
            fluid
            style={{
                backgroundColor: "#E6F0FD",
                padding: "3rem",
                display: "flex",
                justifyContent: "center",
            }}
        >
            <Helmet>
                <title>Login</title>
            </Helmet>
            <div className="login">
                <aside className="login__image">
                    <img src={backgroundForm} alt="" className="login__image__background"></img>
                    <div className="login__image__content">
                        <strong className="login__image__content__name">DIGITAL-E</strong>
                        <p className="login__image__content__desc">An E-commerce platforms of electronics devices</p>
                    </div>
                </aside>
                <main className="login__form">
                    <h3 className="login__form__title">Welcome back</h3>
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
                                autoComplete="off"
                                value={user.email}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-3" controlId="formBasicPassword">
                            <Form.Label>Password</Form.Label>
                            <Form.Control
                                type="password"
                                name="password"
                                placeholder="Password"
                                className="login__form__container__group__input"
                                required
                                autoComplete="off"
                                value={user.password}
                                onChange={handleChangeInput}
                            />
                        </Form.Group>

                        <Form.Group className="login__form__container__group mb-5 mt-5">
                            <Form.Label>Login as:</Form.Label>
                            <br />
                            <Form.Check
                                inline
                                type="radio"
                                name="signup-customer"
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
                                name="signup-admin"
                                id="admin-radio"
                                value={Role.Admin}
                                checked={user.role === Role.Admin}
                                onChange={handleChangeRadio}
                            />
                            <Form.Label htmlFor="admin-radio">Admin</Form.Label>
                        </Form.Group>
                        <Form.Group className="login__form__container__group mb-3 mt-5" controlId="formBasicCheckbox">
                            <Form.Check
                                inline
                                type="checkbox"
                                name="signup-role"
                                checked={rememberMe === true}
                                onChange={handleChangeCheckbox}
                                label="Remember me"
                            />
                        </Form.Group>
                        <div className="mb-5">
                            {errors.map((error, id) => (
                                <div className="text-danger mb-2" key={id}>
                                    {error}
                                </div>
                            ))}
                        </div>
                        <Button
                            variant="primary"
                            name="login"
                            type="submit"
                            style={{
                                width: "100%",
                                height: "3rem",
                                fontSize: "16px",
                                textTransform: "uppercase",
                            }}
                        >
                            Login
                        </Button>
                        <div className="mt-4" style={{ textAlign: "center" }}>
                            Don't have an account? <Link to="/signup">Register</Link>
                        </div>
                    </Form>
                </main>
            </div>
        </Container>
    );
};
export default LoginPage;
