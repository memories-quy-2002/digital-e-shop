import React from "react";
import { Button, Container, Form } from "react-bootstrap";
import "../../styles/LoginPage.scss";

const SignupPage = () => {
	return (
		<Container fluid>
			<div className="login">
				<div className="login__image">
					<img
						src={require("../../assets/images/background_form.jpg")}
						alt=""
						className="login__image__background"
					></img>
					<div className="login__image__content">
						<strong className="login__image__content__name">
							DIGITAL-E
						</strong>
						<p className="login__image__content__desc">
							An E-commerce platforms of electronics devices
						</p>
					</div>
				</div>
				<div className="login__form">
					<h3 className="login__form__title">Create new account</h3>
					<Form className="login__form__container">
						<Form.Group
							className="login__form__container__group mb-3"
							controlId="formBasicUserName"
						>
							<Form.Label>Username</Form.Label>
							<Form.Control
								type="text"
								className="login__form__container__group__input"
								required
							/>
						</Form.Group>
						<Form.Group
							className="login__form__container__group mb-3"
							controlId="formBasicEmail"
						>
							<Form.Label>Email address</Form.Label>
							<Form.Control
								type="email"
								className="login__form__container__group__input"
								required
							/>
						</Form.Group>
						<Form.Group
							className="login__form__container__group mb-3"
							controlId="formBasicPassword"
						>
							<Form.Label>Password</Form.Label>
							<Form.Control
								type="password"
								className="login__form__container__group__input"
								required
							/>
						</Form.Group>
						<Form.Group
							className="login__form__container__group mb-3"
							controlId="formBasicConfirmPassword"
						>
							<Form.Label>Confirm Password</Form.Label>
							<Form.Control
								type="password"
								className="login__form__container__group__input"
								required
							/>
						</Form.Group>
						<Form.Group
							className="login__form__container__group mb-3"
							controlId="formBasicRadio"
						>
							<Form.Label>Sign up as:</Form.Label>
							<br />
							<Form.Check
								inline
								type="radio"
								name="signup-role"
								label="Customer"
								id="inline-type-radio-1"
							/>
							<Form.Check
								inline
								type="radio"
								name="signup-role"
								label="Admin"
								id="inline-type-radio-1"
							/>
						</Form.Group>
						<Button
							variant="primary"
							type="submit"
							style={{ width: "100%" }}
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
