import { Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import axios from "../../api/axios";
import React, { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { Helmet } from "react-helmet";
import { useToast } from "../../context/ToastContext";

interface CartProps {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    sale_price?: number | null;
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
    const { userData, loading } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
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
        const errors = validateForm();
        if (errors.length > 0) {
            setErrors(errors);
            return;
        }
        if (!uid) {
            setErrors(["You must be logged in to complete checkout."]);
            addToast("Checkout", "Please login to complete checkout.");
            return;
        }
        try {
            const response = await axios.post(`/api/orders/purchase/${uid}`, {
                cart,
                totalPrice,
                discount,
                subtotal,
                shippingAddress: formCheckout.address,
            });
            if (response.status === 201) {
                const orderId =
                    response.data?.order?.id ||
                    response.data?.orderId ||
                    response.data?.id ||
                    `ORD-${Date.now()}`;
                const payload = {
                    orderId,
                    totalPrice,
                    discount,
                    subtotal,
                    itemsCount: cart.reduce((sum, item) => sum + item.quantity, 0),
                    placedAt: new Date().toISOString(),
                };
                const payloadSensitive = {
                    ...payload,
                    email: formCheckout.email,
                    name: `${formCheckout.first_name} ${formCheckout.last_name}`.trim(),
                    address: formCheckout.address,
                    city: formCheckout.city,
                    country: formCheckout.country || "",
                    phone: formCheckout.phone_number || "",
                };
                sessionStorage.setItem("checkoutSuccess", JSON.stringify(payload));
                navigate("/checkout-success", { state: { checkoutSuccess: payloadSensitive } });
            }
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const axiosError = err as { response: { status: number; data: { msg: string } } };
                setErrors([axiosError.response.data.msg]);
                addToast("Checkout", axiosError.response.data.msg || "Checkout failed.");
            } else if (err instanceof Error) {
                setErrors(["An unexpected error occurred."]);
                addToast("Checkout", "An unexpected error occurred.");
            }
        }
    };

    const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="checkout">
            <Helmet>
                <title>Checkout | Digital-E</title>
                <meta name="description" content="Complete your purchase securely and confirm shipping details." />
            </Helmet>
            <div className="checkout__hero">
                <button className="checkout__back" onClick={() => setIsPayment(false)}>
                    Back to cart
                </button>
                <div className="checkout__hero__content">
                    <p className="checkout__hero__eyebrow">Secure checkout</p>
                    <h1>Review, confirm, and pay</h1>
                    <p>
                        Your order is almost ready. Add your contact details, confirm shipping, and complete your
                        purchase in one step.
                    </p>
                </div>
                <div className="checkout__hero__meta">
                    <div>
                        <strong>{itemsCount}</strong>
                        <span>Items</span>
                    </div>
                    <div>
                        <strong>${(totalPrice - discount).toFixed(2)}</strong>
                        <span>Total due</span>
                    </div>
                </div>
            </div>

            <div className="checkout__layout">
                <section className="checkout__form">
                    {loading ? <div className="checkout__note">Checking session...</div> : null}
                    {errors.length > 0 ? (
                        <div className="checkout__alert">
                            {errors.map((error, id) => (
                                <span key={id}>{error}</span>
                            ))}
                        </div>
                    ) : null}

                    <div className="checkout__card">
                        <div className="checkout__card__header">
                            <h2>Contact</h2>
                            <p>We will send order updates to this email.</p>
                        </div>
                        <Form>
                            <Form.Group className="mb-3" controlId="formBasicEmail">
                                <Form.Label>Email address</Form.Label>
                                <Form.Control
                                    type="email"
                                    name="email"
                                    placeholder="name@email.com"
                                    required
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <Form.Group className="mb-3" controlId="formBasicCheckbox">
                                <Form.Check type="checkbox" label="Keep me up to date with new products and sales" />
                            </Form.Group>
                        </Form>
                    </div>

                    <div className="checkout__card">
                        <div className="checkout__card__header">
                            <h2>Shipping</h2>
                            <p>Tell us where to deliver your items.</p>
                        </div>
                        <Form>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formFirstName">
                                        <Form.Label>First name</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="first_name"
                                            placeholder="First name"
                                            required
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formLastName">
                                        <Form.Label>Last name</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="last_name"
                                            placeholder="Last name"
                                            required
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <Form.Group className="mb-3" controlId="formShippingAddress">
                                <Form.Label>Shipping address</Form.Label>
                                <Form.Control
                                    type="text"
                                    name="address"
                                    placeholder="Street address"
                                    required
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formCity">
                                        <Form.Label>City</Form.Label>
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

                    <div className="checkout__card">
                        <div className="checkout__card__header">
                            <h2>Payment</h2>
                            <p>Securely enter your card details.</p>
                        </div>
                        <Form>
                            <Form.Group className="mb-3" controlId="formCreditCardNumber">
                                <Form.Label>Card number</Form.Label>
                                <Form.Control
                                    type="number"
                                    name="card_number"
                                    placeholder="1234 5678 9012 3456"
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formExpirationDate">
                                        <Form.Label>Expiration date</Form.Label>
                                        <Form.Control type="date" name="exp_date" placeholder="MM/YY" />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group className="mb-3" controlId="formCVV">
                                        <Form.Label>CVV</Form.Label>
                                        <Form.Control
                                            type="number"
                                            name="CVV"
                                            placeholder="123"
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                            </div>
                        </Form>
                    </div>
                </section>

                <aside className="checkout__summary">
                    <div className="checkout__summary__card">
                        <h2>Order summary</h2>
                        <div className="checkout__summary__list">
                            {cart.slice(0, 3).map((item) => (
                                <div key={item.cartItemId} className="checkout__summary__item">
                                    <div>
                                        <strong>{item.productName}</strong>
                                        <span>
                                            {item.quantity} x ${item.sale_price ?? item.price}
                                        </span>
                                    </div>
                                    <span>${(item.quantity * (item.sale_price ?? item.price)).toFixed(2)}</span>
                                </div>
                            ))}
                            {cart.length > 3 ? (
                                <div className="checkout__summary__more">+ {cart.length - 3} more items</div>
                            ) : null}
                        </div>
                        <div className="checkout__summary__rows">
                            <div>
                                <span>Subtotal</span>
                                <strong>${totalPrice.toFixed(2)}</strong>
                            </div>
                            <div>
                                <span>Shipping</span>
                                <strong className="free">Free</strong>
                            </div>
                            <div>
                                <span>Discount</span>
                                <strong className="muted">-${discount.toFixed(2)}</strong>
                            </div>
                        </div>
                        <div className="checkout__summary__total">
                            <span>Total</span>
                            <strong>${(totalPrice - discount).toFixed(2)}</strong>
                        </div>
                        <button type="button" onClick={handlePurchase}>
                            Place order
                        </button>
                        <p className="checkout__summary__footnote">
                            By placing your order, you agree to our store policies.
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default CheckoutPaymentPage;
