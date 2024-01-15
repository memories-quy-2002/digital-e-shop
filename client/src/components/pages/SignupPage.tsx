import React, { useState } from "react";
import { Button, Container, Form } from "react-bootstrap";
import "../../styles/SignupPage.scss";
import axios from "../../api/axios";
import { useNavigate } from "react-router-dom";

enum UserRole {
	Customer = "Customer",
	Admin = "Admin",
}
interface User {
	username: string;
	email: string;
	password: string;
	confirm: string;
	role: UserRole;
}
const SignupPage = () => {
	const navigate = useNavigate();
	const [user, setUser] = useState<User>({
		username: "",
		email: "",
		password: "",
		confirm: "",
		role: UserRole.Customer,
	});

	const [errors, setErrors] = useState<string[]>([]);

	const validateForm = (): void => {
		const errorsList: string[] = [];
		var emailFormat =
			/^([A-Za-z0-9_\-\.])+\@([A-Za-z0-9_\-\.])+\.([A-Za-z]{2,4})$/;
		if (!user.username) {
			errorsList.push("Username is required");
		}
		if (!user.email) {
			errorsList.push("Email is required");
		} else if (!user.email.match(emailFormat)) {
			errorsList.push("Invalid email format");
		}
		if (!user.password) {
			errorsList.push("Password is required");
		} else if (user.password.length < 8) {
			errorsList.push("Password should be from 8 letters or more");
		} else if (!user.confirm) {
			errorsList.push("Confirm password is required");
		} else if (user.password !== user.confirm) {
			errorsList.push("Confirm password is not match");
		}
		setErrors(errorsList);
	};

	const handleChangeInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		const { name, value } = event.target;
		setUser({ ...user, [name]: value });
	};
	const handleChangeRadio = (event: React.ChangeEvent<HTMLInputElement>) => {
		const selectedRole = event.target.value as UserRole;
		setUser({ ...user, role: selectedRole });
	};
	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			validateForm();
			const response = await axios.post("/post/user", { user });
			if (response.status === 200) {
				console.log(response.data.msg);
				if (errors.length === 0) {
					navigate("/");
				}
			}
		} catch (err) {
			throw err;
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
								name="signup-role"
								label="Customer"
								value={UserRole.Customer}
								checked={user.role === UserRole.Customer}
								onChange={handleChangeRadio}
							/>
							<Form.Check
								inline
								type="radio"
								name="signup-role"
								label="Admin"
								value={UserRole.Admin}
								checked={user.role === UserRole.Admin}
								onChange={handleChangeRadio}
							/>
						</Form.Group>
						<div className="mb-5">
							{errors.map((error) => (
								<div className="text-danger mb-2">{error}</div>
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
