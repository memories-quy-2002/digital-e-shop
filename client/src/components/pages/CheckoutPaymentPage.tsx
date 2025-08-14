import { Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";
import React, { useEffect, useState } from "react";

const cookies = new Cookies();

interface CartProps {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    main_image: string;
    quantity: number;
}

interface CheckoutForm {
    email: string;
    first_name: string;
    last_name: string;
    address: string;
    city: string;
    country: string | null;
    card_number: string | null;
    exp_date: Date | null;
    CVV: string | null;
    phone_number: string | null;
}

type CheckoutPaymentProps = {
    setIsPayment: (isPayment: boolean) => void;
    cart: CartProps[];
    totalPrice: number;
    discount: number;
    subtotal: number;
};

const CheckoutPaymentPage = ({ setIsPayment, cart, totalPrice, discount, subtotal }: CheckoutPaymentProps) => {
    const navigate = useNavigate();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"] ? JSON.parse(sessionStorage["rememberMe"]).uid : "");
    const [formCheckout, setFormCheckout] = useState<CheckoutForm>({
        email: "",
        first_name: "",
        last_name: "",
        address: "",
        city: "",
        country: null,
        card_number: null,
        exp_date: null,
        CVV: null,
        phone_number: null,
    });
    const [errors, setErrors] = useState<string[]>([]);
    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (!formCheckout.email) {
            errorsList.push("Email is required");
        } else if (!formCheckout.email.match(emailPattern)) {
            errorsList.push("Invalid email format");
        } else if (!formCheckout.address) {
            errorsList.push("Shipping address is required");
        }
        return errorsList;
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormCheckout({ ...formCheckout, [name]: value });
    };
    const handlePurchase = async () => {
        setErrors([]);
        const errors = validateForm(); // Capture validation errors
        if (errors.length > 0) {
            setErrors(errors); // Display errors, no need to proceed further
            return;
        }
        try {
            const response = await axios.post(`/api/purchase/${uid}`, {
                cart,
                totalPrice,
                discount,
                subtotal,
                shippingAddress: formCheckout.address,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                navigate("/checkout-success");
            }
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const axiosError = err as { response: { status: number; data: { msg: string } } };
                const status = axiosError.response.status;
                setErrors([axiosError.response.data.msg]);
                if (status === 401) {
                    console.error("Unauthorized access. Please check your credentials.");
                } else if (status === 500) {
                    console.error("Internal Server Error. Please try again later.");
                } else {
                    console.error(`Error: ${status}`);
                }
            } else if (err instanceof Error) {
                console.error(err.message);
                setErrors(["An unexpected error occurred."]);
            } else {
                console.error("Unknown error");
                setErrors(["An unexpected error occurred."]);
            }
        }
    };
    useEffect(() => {
        console.log(formCheckout);
    }, [formCheckout]);

    return (
        <div className="cart__container__payment">
            <button className="cart__container__payment__back" onClick={() => setIsPayment(false)}>
                &#8592; Back to cart
            </button>
            <h2>Checkout Payment</h2>

            <div className="cart__container__payment__main">
                <main className="cart__container__payment__form">
                    <div>
                        {errors.map((error, id) => (
                            <div className="text-danger" key={id}>
                                {error}
                            </div>
                        ))}
                    </div>
                    <div className="cart__container__payment__form__contact">
                        <h4>Contact information</h4>
                        <Form>
                            <Form.Group className="mb-3" controlId="formBasicEmail">
                                <Form.Label>
                                    Email address <span className="cart__container__payment__form__required">*</span>
                                </Form.Label>
                                <Form.Control
                                    type="email"
                                    name="email"
                                    placeholder="Enter email"
                                    required
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3" controlId="formBasicCheckbox">
                                <Form.Check type="checkbox" label="Keep me up to date with new products and sales" />
                            </Form.Group>
                        </Form>
                    </div>
                    <div className="cart__container__payment__form__shipping">
                        <h4>Shipping Information</h4>
                        <Form>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formFirstName">
                                        <Form.Label>
                                            First name{" "}
                                            <span className="cart__container__payment__form__required">*</span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="first_name"
                                            placeholder="Enter first name"
                                            required
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formLastName">
                                        <Form.Label>
                                            Last name{" "}
                                            <span className="cart__container__payment__form__required">*</span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="last_name"
                                            placeholder="Enter last name"
                                            required
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <Form.Group className="mb-3" controlId="formShippingAddress">
                                <Form.Label>
                                    Shipping Address <span className="cart__container__payment__form__required">*</span>
                                </Form.Label>
                                <Form.Control
                                    type="text"
                                    name="address"
                                    placeholder="Shipping Address"
                                    required
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formCity">
                                        <Form.Label>
                                            City <span className="cart__container__payment__form__required">*</span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="city"
                                            placeholder="City"
                                            required
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formCountry">
                                        {/* Assuming country should be a dropdown */}
                                        {/* Replace options with actual country names */}
                                        <Form.Label>Country</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="country"
                                            placeholder="Country"
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Group className="mb-3" controlId="formCreditCardNumber">
                                <Form.Label>Credit Card number</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="card_number"
                                    placeholder="Credit Card number"
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formExpirationDate">
                                        <Form.Label>Credit Card Expiration Date</Form.Label>
                                        <Form.Control type="date" name="exp_date" placeholder="MM/YY" />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formCVV">
                                        <Form.Label>CVV</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="CVV"
                                            placeholder="CVV"
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <Form.Group className="mb-3" controlId="formPhoneNumber">
                                <Form.Label>Phone number</Form.Label>
                                <Form.Control
                                    type="tel"
                                    name="phone_number"
                                    placeholder="Phone number"
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                        </Form>
                    </div>
                </main>
                <aside className="cart__container__payment__aside">
                    <div className="cart__container__payment__aside__details">
                        <h2>Order Details</h2>
                        <div className="cart__container__payment__aside__details__price">
                            <div className="cart__container__payment__aside__details__price__subtotal">
                                <span>Subtotal</span>
                                <span>${totalPrice.toFixed(2)}</span>
                            </div>
                            <div className="cart__container__payment__aside__details__price__delivery">
                                <span>Delivery charges</span>
                                <span style={{ color: "green" }}>Free</span>
                            </div>
                            <div className="cart__container__payment__aside__details__price__discount">
                                <span>Discount price</span>
                                <span>${discount.toFixed(2)}</span>
                            </div>
                        </div>
                        <div className="cart__container__payment__aside__details__total">
                            <span>Total amount:</span>
                            <span>${(totalPrice - discount).toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Checkout Button */}
                    <button type="button" onClick={handlePurchase}>
                        PROCESS CHECKOUT
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default CheckoutPaymentPage;
