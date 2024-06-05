import { Form } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import Cookies from "universal-cookie";
import axios from "../../api/axios";

const cookies = new Cookies();

interface CartProps {
    cartItemId: number;
    productId: number;
    productName: string;
    category: string;
    brand: string;
    price: number;
    image: string;
    quantity: number;
}

type CheckoutPaymentProps = {
    setIsPayment: (isPayment: boolean) => void;
    cart: CartProps[];
    totalPrice: number;
    discount: number;
};

const CheckoutPaymentPage = ({
    setIsPayment,
    cart,
    totalPrice,
    discount,
}: CheckoutPaymentProps) => {
    const navigate = useNavigate();
    const uid =
        cookies.get("rememberMe")?.uid ||
        (sessionStorage["rememberMe"]
            ? JSON.parse(sessionStorage["rememberMe"]).uid
            : "");
    const handlePurchase = async () => {
        try {
            const response = await axios.post(`/api/purchase/${uid}`, {
                cart,
                totalPrice,
            });
            if (response.status === 200) {
                console.log(response.data.msg);
                navigate("/checkout-success");
            }
        } catch (err) {
            console.error(err);
        }
    };
    console.log(cart);

    return (
        <div className="cart__container__payment">
            <button
                className="cart__container__payment__back"
                onClick={() => setIsPayment(false)}
            >
                &#8592; Back to cart
            </button>
            <h2>Checkout Payment</h2>

            <div className="cart__container__payment__main">
                <div className="cart__container__payment__form">
                    <div className="cart__container__payment__form__contact">
                        <h4>Contact information</h4>
                        <Form>
                            <Form.Group
                                className="mb-3"
                                controlId="formBasicEmail"
                            >
                                <Form.Label>
                                    Email address{" "}
                                    <span className="cart__container__payment__form__required">
                                        *
                                    </span>
                                </Form.Label>
                                <Form.Control
                                    type="email"
                                    placeholder="Enter email"
                                />
                            </Form.Group>
                            <Form.Group
                                className="mb-3"
                                controlId="formBasicCheckbox"
                            >
                                <Form.Check
                                    type="checkbox"
                                    label="Keep me up to date with new products and sales"
                                />
                            </Form.Group>
                        </Form>
                    </div>
                    <div className="cart__container__payment__form__shipping">
                        <h4>Shipping Information</h4>
                        <Form>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formFirstName"
                                    >
                                        <Form.Label>
                                            First name{" "}
                                            <span className="cart__container__payment__form__required">
                                                *
                                            </span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Enter first name"
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formLastName"
                                    >
                                        <Form.Label>
                                            Last name{" "}
                                            <span className="cart__container__payment__form__required">
                                                *
                                            </span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Enter last name"
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <Form.Group
                                className="mb-3"
                                controlId="formShippingAddress"
                            >
                                <Form.Label>
                                    Shipping Address{" "}
                                    <span className="cart__container__payment__form__required">
                                        *
                                    </span>
                                </Form.Label>
                                <Form.Control
                                    type="text"
                                    placeholder="Shipping Address"
                                    required
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formCity"
                                    >
                                        <Form.Label>
                                            City{" "}
                                            <span className="cart__container__payment__form__required">
                                                *
                                            </span>
                                        </Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="City"
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formCountry"
                                    >
                                        {/* Assuming country should be a dropdown */}
                                        {/* Replace options with actual country names */}
                                        <Form.Label>Country</Form.Label>
                                        <Form.Control
                                            type="text"
                                            placeholder="Country"
                                        />
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Group
                                className="mb-3"
                                controlId="formCreditCardNumber"
                            >
                                <Form.Label>Credit Card number</Form.Label>
                                <Form.Control
                                    type="number"
                                    placeholder="Credit Card number"
                                />
                            </Form.Group>
                            <div className="row">
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formExpirationDate"
                                    >
                                        <Form.Label>
                                            Credit Card Expiration Date
                                        </Form.Label>
                                        <Form.Control
                                            type="date"
                                            placeholder="MM/YY"
                                        />
                                    </Form.Group>
                                </div>
                                <div className="col-md-6">
                                    <Form.Group
                                        className="mb-3"
                                        controlId="formCVV"
                                    >
                                        <Form.Label>CVV</Form.Label>
                                        <Form.Control
                                            type="number"
                                            placeholder="CVV"
                                        />
                                    </Form.Group>
                                </div>
                            </div>

                            <Form.Group
                                className="mb-3"
                                controlId="formPhoneNumber"
                            >
                                <Form.Label>Phone number</Form.Label>
                                <Form.Control
                                    type="tel"
                                    placeholder="Phone number"
                                />
                            </Form.Group>
                        </Form>
                    </div>
                </div>
                <div className="cart__container__payment__aside">
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
                    <button onClick={handlePurchase}>PROCESS CHECKOUT</button>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPaymentPage;
