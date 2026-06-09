import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Form } from "react-bootstrap";
import { Helmet } from "react-helmet";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { BankIcon, CashStackIcon, CheckCircleIcon, ShieldIcon } from "../../../components/common/Icons";
import http from "../../../lib/http";
import { toUtcIsoString } from "../../../utils/dateTime";
import { CustomerAddress, fetchCustomerAddresses } from "../../users/api";
import {
    CartValidationIssue,
    CheckoutCartItem,
    getCartValidationMessage,
    normalizeCheckoutCartItems,
} from "../types";

interface CheckoutForm {
    email: string;
    first_name: string;
    last_name: string;
    address: string;
    city: string;
    country: string | null;
    phone_number: string | null;
    payment_method: "bank_transfer" | "cash";
}

type CheckoutPaymentProps = {
    setIsPayment: (isPayment: boolean) => void;
    cart: CheckoutCartItem[];
    totalPrice: number;
    discount: number;
    subtotal: number;
    validationIssues: CartValidationIssue[];
    onValidationRefresh: (nextCart: CheckoutCartItem[], issues: CartValidationIssue[]) => void;
};

type SavedAddress = CustomerAddress;
const CheckoutPaymentPage = ({
    setIsPayment,
    cart,
    totalPrice,
    discount,
    validationIssues,
    onValidationRefresh,
}: CheckoutPaymentProps) => {
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
        phone_number: null,
        payment_method: "bank_transfer",
    });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [isValidatingCart, setIsValidatingCart] = useState(false);
    const cartRef = useRef(cart);

    const applyValidationPayload = useCallback(
        (data?: { issues?: CartValidationIssue[]; cartItems?: unknown[] }) => {
            if (!data) {
                return;
            }

            const issues = data.issues || [];
            if (Array.isArray(data.cartItems)) {
                const nextCart = normalizeCheckoutCartItems(data.cartItems);
                cartRef.current = nextCart;
                onValidationRefresh(nextCart, issues);
                return;
            }

            if (issues.length > 0) {
                onValidationRefresh(cartRef.current, issues);
            }
        },
        [onValidationRefresh],
    );

    const paymentOptions = [
        {
            value: "bank_transfer" as const,
            title: "Bank transfer",
            eyebrow: "Best for receipts",
            description: "Send payment before shipment. Use the order ID as your transfer reference.",
            meta: "Manual confirmation",
            icon: <BankIcon size={22} />,
        },
        {
            value: "cash" as const,
            title: "Cash on delivery",
            eyebrow: "Pay at your door",
            description: "Pay when the delivery partner hands over your package.",
            meta: "Phone verification may apply",
            icon: <CashStackIcon size={22} />,
        },
    ];

    const selectedPayment = paymentOptions.find((option) => option.value === formCheckout.payment_method) || paymentOptions[0];
    const defaultAddress = useMemo(() => savedAddresses.find((address) => address.is_default) || savedAddresses[0], [savedAddresses]);

    useEffect(() => {
        cartRef.current = cart;
    }, [cart]);

    useEffect(() => {
        const loadAddresses = async () => {
            if (!uid) return;
            try {
                setSavedAddresses(await fetchCustomerAddresses(uid));
            } catch {
                setSavedAddresses([]);
            }
        };

        loadAddresses();
    }, [uid]);

    useEffect(() => {
        if (!userData?.email || formCheckout.email) return;

        setFormCheckout((current) => ({
            ...current,
            email: userData.email,
        }));
    }, [formCheckout.email, userData?.email]);

    useEffect(() => {
        if (!defaultAddress || formCheckout.address) return;
        setFormCheckout((current) => ({
            ...current,
            address: defaultAddress.address_line || "",
            city: defaultAddress.city || "",
            country: defaultAddress.country || "",
            phone_number: defaultAddress.phone_number || "",
            first_name: defaultAddress.recipient_name?.split(" ")[0] || current.first_name,
            last_name: defaultAddress.recipient_name?.split(" ").slice(1).join(" ") || current.last_name,
        }));
    }, [defaultAddress, formCheckout.address]);

    const validateForm = (): string[] => {
        const errorsList: string[] = [];
        const emailPattern = /^([A-Za-z0-9_\-.])+@([A-Za-z0-9_\-.])+\.([A-Za-z]{2,4})$/;
        if (!formCheckout.email) {
            errorsList.push("Email is required");
        } else if (!formCheckout.email.match(emailPattern)) {
            errorsList.push("Invalid email format");
        }
        if (!formCheckout.first_name.trim()) {
            errorsList.push("First name is required");
        }
        if (!formCheckout.last_name.trim()) {
            errorsList.push("Last name is required");
        }
        if (!formCheckout.address.trim()) {
            errorsList.push("Shipping address is required");
        }
        if (!formCheckout.city.trim()) {
            errorsList.push("City is required");
        }
        if (!formCheckout.payment_method) {
            errorsList.push("Please select a payment method");
        }
        return errorsList;
    };

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormCheckout({ ...formCheckout, [name]: value });
    };

    const applySavedAddress = (address: SavedAddress) => {
        const nameParts = (address.recipient_name || "").split(" ").filter(Boolean);
        setFormCheckout((current) => ({
            ...current,
            first_name: nameParts[0] || current.first_name,
            last_name: nameParts.slice(1).join(" ") || current.last_name,
            address: address.address_line,
            city: address.city || "",
            country: address.country || "",
            phone_number: address.phone_number || "",
        }));
    };

    const validateCartStock = useCallback(async (): Promise<CheckoutCartItem[] | null> => {
        if (!uid) {
            return null;
        }

        try {
            setIsValidatingCart(true);
            const response = await http.get(`/api/cart/${uid}/validation`);
            if (Array.isArray(response.data.cartItems)) {
                const nextCart = normalizeCheckoutCartItems(response.data.cartItems);
                cartRef.current = nextCart;
                onValidationRefresh(nextCart, []);
                if (response.status === 200 && response.data.valid === true) {
                    return nextCart;
                }
            }
            return response.status === 200 && response.data.valid === true ? cartRef.current : null;
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const response = (err as {
                    response?: { data?: { issues?: CartValidationIssue[]; msg?: string; cartItems?: any[] } };
                }).response;
                const issues = response?.data?.issues || [];
                applyValidationPayload(response?.data);
                const message = getCartValidationMessage(issues);
                setErrors([message]);
                addToast("Checkout", message);
            } else {
                setErrors(["Unable to validate cart stock right now."]);
                addToast("Checkout", "Unable to validate cart stock right now.");
            }
            return null;
        } finally {
            setIsValidatingCart(false);
        }
    }, [addToast, onValidationRefresh, uid]);

    const handlePurchase = async () => {
        setErrors([]);
        const validationErrors = validateForm();
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }
        if (!uid) {
            setErrors(["You must be logged in to complete checkout."]);
            addToast("Checkout", "Please login to complete checkout.");
            return;
        }
        if (validationIssues.length > 0) {
            const message = getCartValidationMessage(validationIssues);
            setErrors([message]);
            addToast("Checkout", "Please update cart quantities before placing the order.");
            return;
        }
        const latestCart = await validateCartStock();
        if (!latestCart) {
            return;
        }
        try {
            setIsSubmitting(true);
            const latestTotalPrice = latestCart.reduce(
                (sum, item) => sum + (item.sale_price ?? item.price) * item.quantity,
                0,
            );
            const response = await http.post(`/api/orders/purchase/${uid}`, {
                cart: latestCart,
                totalPrice: latestTotalPrice,
                discount,
                shippingAddress: formCheckout.address,
                paymentMethod: formCheckout.payment_method,
            });
            if (response.status === 201) {
                const orderId =
                    response.data?.order?.id ||
                    response.data?.orderId ||
                    response.data?.id ||
                    `ORD-${Date.now()}`;
                const placedAt = response.data?.order?.date_added || response.data?.placedAt || toUtcIsoString();
                const payload = {
                    orderId,
                    totalPrice: latestTotalPrice,
                    discount,
                    subtotal: latestTotalPrice - discount,
                    itemsCount: latestCart.reduce((sum, item) => sum + item.quantity, 0),
                    placedAt,
                    paymentMethod: formCheckout.payment_method,
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
                const axiosError = err as {
                    response: {
                        data: {
                            msg?: string;
                            issues?: CartValidationIssue[];
                            authoritativeCart?: unknown[];
                            cartItems?: unknown[];
                        };
                    };
                };
                applyValidationPayload({
                    issues: axiosError.response.data.issues,
                    cartItems: axiosError.response.data.authoritativeCart || axiosError.response.data.cartItems,
                });
                const message = axiosError.response.data.msg || "Checkout failed.";
                setErrors([message]);
                addToast("Checkout", message);
            } else {
                setErrors(["An unexpected error occurred."]);
                addToast("Checkout", "An unexpected error occurred.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const hasValidationIssues = validationIssues.length > 0;

    useEffect(() => {
        if (!uid || cart.length === 0) {
            return;
        }

        validateCartStock();
    }, [cart.length, uid, validateCartStock]);

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
                    {isValidatingCart ? <div className="checkout__note">Checking latest stock before payment...</div> : null}
                    {errors.length > 0 ? (
                        <div className="checkout__alert">
                            {errors.map((error, id) => (
                                <span key={id}>{error}</span>
                            ))}
                        </div>
                    ) : null}
                    {hasValidationIssues ? (
                        <div className="checkout__alert checkout__alert--warning">
                            <strong>Review your cart before placing the order.</strong>
                            {validationIssues.map((issue) => (
                                <span key={`${issue.cartItemId || issue.productName}-${issue.reason}`}>
                                    {issue.reason === "unavailable"
                                        ? `${issue.productName} is no longer available.`
                                        : issue.reason === "out_of_stock"
                                        ? `${issue.productName} is out of stock.`
                                        : `${issue.productName} has ${issue.availableStock} item(s) available, but your cart has ${issue.requestedQuantity}.`}
                                </span>
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
                                    value={formCheckout.email}
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
                        {savedAddresses.length > 0 ? (
                            <div className="checkout__saved-addresses">
                                {savedAddresses.map((address) => (
                                    <button key={address.id} type="button" onClick={() => applySavedAddress(address)}>
                                        <strong>{address.label}</strong>
                                        <span>{address.address_line}</span>
                                        {address.is_default ? <em>Default</em> : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        <Form>
                            <div className="checkout__field-grid">
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formFirstName">
                                        <Form.Label>First name</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="first_name"
                                            placeholder="First name"
                                            required
                                            value={formCheckout.first_name}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formLastName">
                                        <Form.Label>Last name</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="last_name"
                                            placeholder="Last name"
                                            required
                                            value={formCheckout.last_name}
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
                                    value={formCheckout.address}
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                            <div className="checkout__field-grid">
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formCity">
                                        <Form.Label>City</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="city"
                                            placeholder="City"
                                            required
                                            value={formCheckout.city}
                                            onChange={handleInputChange}
                                        />
                                    </Form.Group>
                                </div>
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formCountry">
                                        <Form.Label>Country</Form.Label>
                                        <Form.Control
                                            type="text"
                                            name="country"
                                            placeholder="Country"
                                            value={formCheckout.country || ""}
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
                                    value={formCheckout.phone_number || ""}
                                    onChange={handleInputChange}
                                />
                            </Form.Group>
                        </Form>
                    </div>

                    <div className="checkout__card">
                        <div className="checkout__card__header">
                            <h2>Payment</h2>
                            <p>Choose how you want to complete this order.</p>
                        </div>
                        <Form className="checkout__payment">
                            <div className="checkout__payment__secure">
                                <ShieldIcon size={18} />
                                <span>No card details are stored by Digital-E. Orders are timestamped in UTC.</span>
                            </div>
                            <div className="checkout__payment__methods" role="radiogroup" aria-label="Payment method">
                                {paymentOptions.map((option) => (
                                    <label
                                        key={option.value}
                                        className={
                                            formCheckout.payment_method === option.value
                                                ? `checkout__payment__method checkout__payment__method--${option.value} is-active`
                                                : `checkout__payment__method checkout__payment__method--${option.value}`
                                        }
                                        htmlFor={`payment-${option.value}`}
                                    >
                                        <input
                                            type="radio"
                                            id={`payment-${option.value}`}
                                            name="payment_method"
                                            value={option.value}
                                            checked={formCheckout.payment_method === option.value}
                                            onChange={handleInputChange}
                                        />
                                        <span className="checkout__payment__method__check">
                                            <CheckCircleIcon size={18} />
                                        </span>
                                        <span className="checkout__payment__method__icon">{option.icon}</span>
                                        <span className="checkout__payment__method__content">
                                            <small>{option.eyebrow}</small>
                                            <strong>{option.title}</strong>
                                            <span>{option.description}</span>
                                            <em>{option.meta}</em>
                                        </span>
                                    </label>
                                ))}
                            </div>

                            <div className="checkout__payment__selected">
                                <span>Selected payment</span>
                                <strong>{selectedPayment.title}</strong>
                                <p>{selectedPayment.description}</p>
                            </div>

                            {formCheckout.payment_method === "bank_transfer" ? (
                                <div className="checkout__payment__details">
                                    <h3>Bank transfer instructions</h3>
                                    <div className="checkout__payment__details__grid">
                                        <div>
                                            <span>Bank</span>
                                            <strong>Vietcombank</strong>
                                        </div>
                                        <div>
                                            <span>Account name</span>
                                            <strong>Digital-E Store</strong>
                                        </div>
                                        <div>
                                            <span>Account number</span>
                                            <strong>1029384756</strong>
                                        </div>
                                        <div>
                                            <span>Reference</span>
                                            <strong>Use your order ID after checkout</strong>
                                        </div>
                                    </div>
                                    <p>
                                        We&apos;ll confirm the transfer and start processing your order as soon as the
                                        payment arrives.
                                    </p>
                                </div>
                            ) : (
                                <div className="checkout__payment__details">
                                    <h3>Cash on delivery notes</h3>
                                    <p>
                                        Please prepare the exact amount if possible. Our delivery partner will collect
                                        the payment when handing over the package.
                                    </p>
                                    <p>Orders paid by cash are confirmed before dispatch and may be verified by phone.</p>
                                </div>
                            )}
                        </Form>
                    </div>
                </section>

                <aside className="checkout__summary">
                    <div className="checkout__summary__card">
                        <h2>Order summary</h2>
                        <div className="checkout__summary__badge">
                            <ShieldIcon size={16} />
                            <span>Stock and pricing are rechecked before the order is placed.</span>
                        </div>
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
                        <button type="button" onClick={handlePurchase} disabled={isSubmitting || isValidatingCart || hasValidationIssues}>
                            {isSubmitting ? "Placing order..." : isValidatingCart ? "Checking stock..." : "Place order"}
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
