import { createUserWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import { auth } from "../../services/firebase";
import "../../styles/SignupPage.scss";
import { Role } from "../../utils/interface";
import Cookies from "universal-cookie";

const cookies = new Cookies();

console.log(cookies.get("rememberMe"));

interface User {
	username: string;
	email: string;
	password: string;
	confirm: string;
	role: Role;
}
const SignupPage = () => {
	const navigate = useNavigate();
	const [user, setUser] = useState<User>({
		username: "",
		email: "",
		password: "",
		confirm: "",
		role: Role.Customer,
	});

	const [errors, setErrors] = useState<string[]>([]);

	const validateForm = (): string[] => {
		const errorsList: string[] = [];
		const usernamePattern = /^[a-zA-Z0-9._-]{3,15}$/; // Allow letters, numbers, ., _, -, length 3-15
		const passwordPattern =
			/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
		const emailPattern =
			/^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
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
			try {
				const userCredential = await createUserWithEmailAndPassword(
					auth,
					user.email,
					user.password
				);
				const uid = userCredential.user.uid;

				const response = await axios.post("/api/users", {
					user,
					uid,
				});
				if (response.status === 200) {
					const token = response.data.token;
					const cookieData = {
						uid,
						token,
					};
					cookies.set("rememberMe", JSON.stringify(cookieData), {
						httpOnly: false,
						// Consider using Secure flag if using HTTPS
						maxAge: 1000 * 60 * 60 * 24 * 7, // Expires in 7 days (adjust as needed)
					});
					navigate("/");
				}
			} catch (err) {
				throw err;
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
			<div className="signup">
				<div className="signup__image">
					<img
						src={require("../../assets/images/background_form.jpg")}
						alt=""
						className="signup__image__background"
					></img>
					<div className="signup__image__content">
						<strong className="signup__image__content__name">
							DIGITAL-E
						</strong>
						<p className="signup__image__content__desc">
							An E-commerce platforms of electronics devices
						</p>
					</div>
				</div>
				<div className="signup__form">
					<h3 className="signup__form__title">Create new account</h3>
					<Form
						className="signup__form__container"
						onSubmit={handleSubmit}
					>
						<Form.Group
							className="signup__form__container__group mb-3"
							controlId="formBasicUserName"
						>
							<Form.Label>Username</Form.Label>
							<Form.Control
								type="text"
								name="username"
								className="signup__form__container__group__input"
								required
								autoComplete="off"
								value={user.username}
								onChange={handleChangeInput}
							/>
						</Form.Group>
						<Form.Group
							className="signup__form__container__group mb-3"
							controlId="formBasicEmail"
						>
							<Form.Label>Email address</Form.Label>
							<Form.Control
								type="email"
								name="email"
								className="signup__form__container__group__input"
								required
								autoComplete="off"
								value={user.email}
								onChange={handleChangeInput}
							/>
						</Form.Group>
						<Form.Group
							className="signup__form__container__group mb-3"
							controlId="formBasicPassword"
						>
							<Form.Label>Password</Form.Label>
							<Form.Control
								type="password"
								name="password"
								className="signup__form__container__group__input"
								required
								autoComplete="off"
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
								className="signup__form__container__group__input"
								required
								autoComplete="off"
								value={user.confirm}
								onChange={handleChangeInput}
							/>
						</Form.Group>
						<Form.Group
							className="signup__form__container__group mb-3 mt-5"
							controlId="formBasicRadio"
						>
							<Form.Label>Signup as:</Form.Label>
							<br />
							<Form.Check
								inline
								type="radio"
								name="signup-role-1"
								label="Customer"
								value={Role.Customer}
								checked={user.role === Role.Customer}
								onChange={handleChangeRadio}
							/>
							<Form.Check
								inline
								type="radio"
								name="signup-role-2"
								label="Admin"
								value={Role.Admin}
								checked={user.role === Role.Admin}
								onChange={handleChangeRadio}
							/>
						</Form.Group>
						<div className="mb-5">
							{errors.map((error, id) => (
								<div key={id} className="text-danger mb-2">
									{error}
								</div>
							))}
						</div>
						<Button
							variant="primary"
							type="submit"
							style={{
								width: "100%",
								height: "3rem",
								fontSize: "16px",
								textTransform: "uppercase",
							}}
						>
							Sign up
						</Button>
						<div className="mt-4" style={{ textAlign: "center" }}>
							Already registered? <a href="/login">Login</a>
						</div>
					</Form>
				</div>
			</div>
		</Container>
	);
};

export default SignupPage;
