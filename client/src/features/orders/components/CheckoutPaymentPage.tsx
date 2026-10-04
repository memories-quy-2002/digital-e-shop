import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HTTP_STATUS } from "../../../constants/http-status";
import { PAYMENT_METHOD, type PaymentMethod } from "../constants";
import { Form } from "../../../components/ui/legacy";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { CashStackIcon, CheckCircleIcon, ShieldIcon } from "../../../components/common/Icons";
import http from "../../../lib/http";
import { toUtcIsoString } from "../../../utils/dateTime";
import { fetchCustomerAddresses } from "../../users/api";
import type { CustomerAddress } from "../../users/api";
import {
    createGuestPayOSCheckoutSession,
    createGuestPurchase,
    createPayOSCheckoutSession,
    fetchCustomerOrders,
} from "../api";
import {
    CartValidationIssue,
    CheckoutCartItem,
    getCartValidationMessage,
    normalizeCheckoutCartItems,
} from "../types";
import { clearGuestCart } from "../guestCartStorage";
import {
    clearPendingCheckout,
    maskPhoneNumber,
    writeCheckoutSuccess,
    writePendingCheckout,
} from "../pages/checkoutSuccessStorage";
import { normalizeCheckoutEmail, validateCheckoutEmail, validateCheckoutForm } from "../checkoutValidation";
import { getApiErrorMessage, getApiErrorPayload } from "../../../lib/api-contract";
import {
    formatShippingAddress,
    getRecentOrderAddresses,
    serializeShippingAddress,
    type RecentOrderAddress,
} from "../shippingAddress";
import { formatCurrency } from "../../../utils/currency";
import { useT } from "../../../hooks/useT";

interface CheckoutForm {
    email: string;
    first_name: string;
    last_name: string;
    address: string;
    city: string;
    country: string | null;
    phone_number: string | null;
    payment_method: PaymentMethod;
}

type CheckoutSubmissionContext = {
    latestCart: CheckoutCartItem[];
    latestTotalPrice: number;
    normalizedEmail: string;
    normalizedName: string;
    guestCart: Array<{ productId: number; quantity: number }>;
    guestContact: { email: string; name: string; phone?: string };
    guestShipping: { address: string; city: string; country: string };
};

type CheckoutPaymentProps = {
    setIsPayment: (isPayment: boolean) => void;
    cart: CheckoutCartItem[];
    totalPrice: number;
    discount: number;
    discountCode: string | null;
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
    discountCode,
    validationIssues,
    onValidationRefresh,
}: CheckoutPaymentProps) => {
    const navigate = useNavigate();
    const { userData, loading } = useAuth();
    const uid = userData?.id || "";
    const { addToast } = useToast();
    const t = useT();
    const [formCheckout, setFormCheckout] = useState<CheckoutForm>({
        email: "",
        first_name: "",
        last_name: "",
        address: "",
        city: "",
        country: null,
        phone_number: null,
        payment_method: PAYMENT_METHOD.PAYOS,
    });
    const [errors, setErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [recentOrderAddresses, setRecentOrderAddresses] = useState<RecentOrderAddress[]>([]);
    const [isValidatingCart, setIsValidatingCart] = useState(false);
    const [isEmailTouched, setIsEmailTouched] = useState(false);
    const [verificationRequired, setVerificationRequired] = useState(false);
    const cartRef = useRef(cart);

    const applyValidationPayload = useCallback(
        (data?: { issues?: CartValidationIssue[]; cartItems?: unknown[] }) => {
            if (!data) return;

            const issues = data.issues || [];
            if (Array.isArray(data.cartItems)) {
                const nextCart = normalizeCheckoutCartItems(data.cartItems);
                cartRef.current = nextCart;
                onValidationRefresh(nextCart, issues);
                return;
            }

            if (issues.length > 0) onValidationRefresh(cartRef.current, issues);
        },
        [onValidationRefresh],
    );

    const paymentOptions = [
        { value: PAYMENT_METHOD.PAYOS, title: t("cart.payos"), description: t("cart.payosNote"), icon: <CashStackIcon size={22} /> },
        { value: PAYMENT_METHOD.CASH, title: t("cart.cashOnDelivery"), description: t("cart.cashOnDeliveryNote"), icon: <CashStackIcon size={22} /> },
    ];

    const selectedPayment = paymentOptions.find((option) => option.value === formCheckout.payment_method) || paymentOptions[0];
    const defaultAddress = useMemo(() => savedAddresses.find((address) => address.is_default) || savedAddresses[0], [savedAddresses]);

    useEffect(() => {
        cartRef.current = cart;
    }, [cart]);

    useEffect(() => {
        let isActive = true;

        if (!uid) {
            setSavedAddresses([]);
            setRecentOrderAddresses([]);
            return () => {
                isActive = false;
            };
        }

        const loadAddressSources = async () => {
            const [addressesResult, ordersResult] = await Promise.allSettled([
                fetchCustomerAddresses(uid),
                fetchCustomerOrders(uid),
            ]);
            if (!isActive) return;

            if (addressesResult.status === "fulfilled") {
                setSavedAddresses(addressesResult.value || []);
            } else {
                setSavedAddresses([]);
                addToast(t("checkout.title"), getApiErrorMessage(addressesResult.reason, t("checkout.savedAddressesError")));
            }

            if (ordersResult.status === "fulfilled") {
                setRecentOrderAddresses(getRecentOrderAddresses(ordersResult.value || []));
            } else {
                setRecentOrderAddresses([]);
                addToast(t("checkout.title"), getApiErrorMessage(ordersResult.reason, t("checkout.recentAddressesError")));
            }
        };

        void loadAddressSources();
        return () => {
            isActive = false;
        };
    }, [uid, addToast, t]);

    useEffect(() => {
        if (!userData?.email || formCheckout.email) return;
        setFormCheckout((current) => ({ ...current, email: userData.email }));
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

    const emailError = validateCheckoutEmail(formCheckout.email);
    const showEmailError = isEmailTouched && Boolean(emailError);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormCheckout((current) => ({ ...current, [name]: value }));
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

    const applyRecentOrderAddress = (address: RecentOrderAddress) => {
        setFormCheckout((current) => ({
            ...current,
            address: address.address,
            city: address.city,
            country: address.country,
        }));
    };

    const validateCartStock = useCallback(async (): Promise<CheckoutCartItem[] | null> => {
        if (!uid) return cartRef.current.length > 0 ? cartRef.current : null;
        try {
            setIsValidatingCart(true);
            const response = await http.get(`/api/cart/${uid}/validation`);
            if (Array.isArray(response.data.cartItems)) {
                const nextCart = normalizeCheckoutCartItems(response.data.cartItems);
                cartRef.current = nextCart;
                onValidationRefresh(nextCart, []);
                if (response.status === HTTP_STATUS.OK && response.data.valid === true) return nextCart;
            }
            return response.status === HTTP_STATUS.OK && response.data.valid === true ? cartRef.current : null;
        } catch (err: unknown) {
            if (err && typeof err === "object" && "response" in err) {
                const response = (err as { response?: { data?: { issues?: CartValidationIssue[]; msg?: string; cartItems?: unknown[] } } }).response;
                const issues = response?.data?.issues || [];
                applyValidationPayload(response?.data);
                const message = getCartValidationMessage(issues);
                setErrors([message]);
                addToast("Checkout", message);
            } else {
                setErrors([t("checkout.validateStockError")]);
                addToast(t("checkout.title"), t("checkout.validateStockError"));
            }
            return null;
        } finally {
            setIsValidatingCart(false);
        }
    }, [addToast, applyValidationPayload, onValidationRefresh, t, uid]);

    const createSubmissionContext = (latestCart: CheckoutCartItem[]): CheckoutSubmissionContext => {
        const normalizedEmail = normalizeCheckoutEmail(formCheckout.email);
        const normalizedName = `${formCheckout.first_name} ${formCheckout.last_name}`.trim();

        return {
            latestCart,
            latestTotalPrice: latestCart.reduce(
                (sum, item) => sum + (item.sale_price ?? item.price) * item.quantity,
                0,
            ),
            normalizedEmail,
            normalizedName,
            guestCart: latestCart.map(({ productId, quantity }) => ({ productId, quantity })),
            guestContact: {
                email: normalizedEmail,
                name: normalizedName,
                ...(formCheckout.phone_number?.trim() ? { phone: formCheckout.phone_number.trim() } : {}),
            },
            guestShipping: {
                address: formCheckout.address.trim(),
                city: formCheckout.city.trim(),
                country: formCheckout.country?.trim() || "",
            },
        };
    };

    const submitPayOSCheckout = async (submission: CheckoutSubmissionContext) => {
        const pendingCheckout = {
            totalPrice: submission.latestTotalPrice,
            discount,
            subtotal: submission.latestTotalPrice - discount,
            itemsCount: submission.latestCart.reduce((sum, item) => sum + item.quantity, 0),
            paymentMethod: formCheckout.payment_method,
            email: submission.normalizedEmail,
            name: submission.normalizedName,
            address: formCheckout.address,
            city: formCheckout.city,
            country: formCheckout.country || "",
            phone: formCheckout.phone_number ? maskPhoneNumber(formCheckout.phone_number) : "",
        };
        const sessionResponse = uid
            ? await createPayOSCheckoutSession(uid, {
                cart: submission.latestCart,
                totalPrice: submission.latestTotalPrice,
                discount,
                discountCode: discountCode || undefined,
                shippingAddress: serializeShippingAddress(submission.guestShipping),
            })
            : await createGuestPayOSCheckoutSession({
                cart: submission.guestCart,
                contact: submission.guestContact,
                shipping: submission.guestShipping,
                discountCode: discountCode || undefined,
                paymentMethod: PAYMENT_METHOD.PAYOS,
            });

        writePendingCheckout({
            ...pendingCheckout,
            ...(sessionResponse.guestOrderToken ? { guestOrderToken: sessionResponse.guestOrderToken } : {}),
        });
        if (sessionResponse.url) {
            window.location.href = sessionResponse.url;
            return;
        }

        setErrors([t("checkout.paymentUrlError")]);
    };

    const submitGuestOrder = async (submission: CheckoutSubmissionContext) => {
        const response = await createGuestPurchase({
            cart: submission.guestCart,
            contact: submission.guestContact,
            shipping: submission.guestShipping,
            discountCode: discountCode || undefined,
            paymentMethod: formCheckout.payment_method,
        });
        const orderTotal = Number(response.order?.total_price);
        const orderDiscount = Number(response.order?.discount);
        const resolvedTotal = Number.isFinite(orderTotal) ? orderTotal : submission.latestTotalPrice;
        const resolvedDiscount = Number.isFinite(orderDiscount) ? orderDiscount : discount;
        const payload = {
            orderId: String(response.orderId || response.order?.id),
            totalPrice: resolvedTotal,
            discount: resolvedDiscount,
            subtotal: Math.max(0, resolvedTotal - resolvedDiscount),
            itemsCount: submission.latestCart.reduce((sum, item) => sum + item.quantity, 0),
            placedAt: response.order?.date_added || toUtcIsoString(),
            paymentMethod: formCheckout.payment_method,
            email: submission.normalizedEmail,
            name: submission.normalizedName,
            address: formCheckout.address,
            city: formCheckout.city,
            country: formCheckout.country || "",
            phone: formCheckout.phone_number ? maskPhoneNumber(formCheckout.phone_number) : "",
            guestOrderToken: response.guestOrderToken,
        } as const;

        writeCheckoutSuccess(payload);
        clearPendingCheckout();
        clearGuestCart();
        navigate("/checkout-success", { state: { checkoutSuccess: payload } });
    };

    const submitAuthenticatedOrder = async (submission: CheckoutSubmissionContext) => {
        const response = await http.post(`/api/orders/purchase/${uid}`, {
            cart: submission.latestCart,
            totalPrice: submission.latestTotalPrice,
            discount,
            discountCode: discountCode || undefined,
            shippingAddress: serializeShippingAddress(submission.guestShipping),
            paymentMethod: formCheckout.payment_method,
        });
        if (response.status !== HTTP_STATUS.CREATED) return;

        const orderId = response.data?.order?.id || response.data?.orderId || response.data?.id || `ORD-${Date.now()}`;
        const placedAt = response.data?.order?.date_added || response.data?.placedAt || toUtcIsoString();
        const payload = {
            orderId,
            totalPrice: submission.latestTotalPrice,
            discount,
            subtotal: submission.latestTotalPrice - discount,
            itemsCount: submission.latestCart.reduce((sum, item) => sum + item.quantity, 0),
            placedAt,
            paymentMethod: formCheckout.payment_method,
        };
        const payloadSensitive = {
            ...payload,
            email: submission.normalizedEmail,
            name: submission.normalizedName,
            address: formCheckout.address,
            city: formCheckout.city,
            country: formCheckout.country || "",
            phone: formCheckout.phone_number ? maskPhoneNumber(formCheckout.phone_number) : "",
        };

        writeCheckoutSuccess(payload);
        navigate("/checkout-success", { state: { checkoutSuccess: payloadSensitive } });
    };

    const handlePurchaseFailure = (err: unknown) => {
        if (err && typeof err === "object" && "response" in err) {
            const payload = getApiErrorPayload(err);
            const requiresVerification = payload?.code === "EMAIL_VERIFICATION_REQUIRED";
            const authoritativeCart = Array.isArray(payload?.authoritativeCart)
                ? payload.authoritativeCart
                : Array.isArray(payload?.cartItems)
                    ? payload.cartItems
                    : undefined;
            setVerificationRequired(requiresVerification);
            applyValidationPayload({
                issues: Array.isArray(payload?.issues) ? payload.issues as CartValidationIssue[] : undefined,
                cartItems: authoritativeCart,
            });
            const message = requiresVerification
                ? t("checkout.verificationRequired")
                : getApiErrorMessage(err, t("checkout.checkoutError"));
            setErrors([message]);
            addToast(t("checkout.title"), message);
            return;
        }

        setErrors([t("checkout.unexpectedError")]);
        addToast(t("checkout.title"), t("checkout.unexpectedError"));
    };

    const handlePurchase = async () => {
        setErrors([]);
        setVerificationRequired(false);
        setIsEmailTouched(true);
        const validationErrors = validateCheckoutForm(formCheckout);
        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            return;
        }
        if (validationIssues.length > 0) {
            const message = getCartValidationMessage(validationIssues);
            setErrors([message]);
            addToast(t("checkout.title"), t("checkout.updateCartQuantities"));
            return;
        }

        const latestCart = await validateCartStock();
        if (!latestCart) return;

        try {
            setIsSubmitting(true);
            const submission = createSubmissionContext(latestCart);
            if (formCheckout.payment_method === PAYMENT_METHOD.PAYOS) {
                await submitPayOSCheckout(submission);
                return;
            }
            if (!uid) {
                await submitGuestOrder(submission);
                return;
            }
            await submitAuthenticatedOrder(submission);
        } catch (err: unknown) {
            handlePurchaseFailure(err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const itemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const hasValidationIssues = validationIssues.length > 0;

    useEffect(() => {
        if (!uid || cart.length === 0) return;
        validateCartStock();
    }, [cart.length, uid, validateCartStock]);

    return (
        <div className="checkout">
            <Helmet>
                <title>{t("checkout.title")} | Digital-E</title>
                <meta name="description" content={t("checkout.description")} />
            </Helmet>
            <div className="checkout__hero">
                <button type="button" className="checkout__back" onClick={() => setIsPayment(false)}>{t("checkout.backToCart")}</button>
                <div className="checkout__hero__content">
                    <p className="checkout__hero__eyebrow">{t("checkout.secureEyebrow")}</p>
                    <h1>{t("checkout.title")}</h1>
                    <p>{t("checkout.description")}</p>
                </div>
                <div className="checkout__hero__meta">
                    <div><strong>{itemsCount}</strong><span>{t("checkout.items")}</span></div>
                    <div><strong>{formatCurrency(totalPrice - discount)}</strong><span>{t("checkout.totalDue")}</span></div>
                </div>
            </div>

            <div className="checkout__layout">
                <section className="checkout__form">
                    {loading ? <div className="checkout__note">{t("checkout.checkingSession")}</div> : null}
                    {isValidatingCart ? <div className="checkout__note">{t("checkout.checkingStock")}</div> : null}
                    {errors.length > 0 ? <div className="checkout__alert">{errors.map((error, id) => <span key={id}>{error}</span>)}</div> : null}
                    {verificationRequired ? (
                        <div className="checkout__alert checkout__alert--warning" role="alert">
                            <span>{t("checkout.verifyAccount")}</span>
                            <Link to="/account">{t("checkout.verifyEmail")}</Link>
                        </div>
                    ) : null}
                    {hasValidationIssues ? (
                        <div className="checkout__alert checkout__alert--warning">
                            <strong>{t("checkout.reviewCart")}</strong>
                            {validationIssues.map((issue) => (
                                <span key={`${issue.cartItemId || issue.productName}-${issue.reason}`}>
                                    {issue.reason === "unavailable"
                                        ? `${issue.productName} ${t("checkout.unavailable")}`
                                        : issue.reason === "out_of_stock"
                                          ? `${issue.productName} ${t("checkout.outOfStock")}`
                                          : t("checkout.quantityAvailable", issue.availableStock, issue.requestedQuantity)}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    <div className="checkout__card">
                        <div className="checkout__card__header"><h2><span>01</span>{t("checkout.contact")}</h2><p>{t("checkout.contactDescription")}</p></div>
                        <Form>
                            <Form.Group className="mb-3" controlId="formBasicEmail">
                                    <Form.Label htmlFor="checkout-email">{t("checkout.email")}</Form.Label>
                                <Form.Control
                                    id="checkout-email"
                                    type="email"
                                    name="email"
                                    placeholder={t("checkout.emailPlaceholder")}
                                    autoComplete="email"
                                    inputMode="email"
                                    required
                                    value={formCheckout.email}
                                    onChange={handleInputChange}
                                    onBlur={() => setIsEmailTouched(true)}
                                    aria-invalid={showEmailError}
                                    aria-describedby={showEmailError ? "checkout-email-error" : undefined}
                                />
                                {showEmailError ? <small id="checkout-email-error" className="checkout__field-error">{emailError}</small> : null}
                            </Form.Group>
                            <Form.Group className="mb-3" controlId="formBasicCheckbox">
                                <Form.Check type="checkbox" label={t("checkout.marketing")} />
                            </Form.Group>
                        </Form>
                    </div>

                    <div className="checkout__card">
                        <div className="checkout__card__header"><h2><span>02</span>{t("checkout.shipping")}</h2><p>{t("checkout.shippingDescription")}</p></div>
                        {savedAddresses.length > 0 ? (
                            <div className="checkout__saved-addresses">
                                {savedAddresses.map((address) => (
                                    <button key={address.id} type="button" onClick={() => applySavedAddress(address)}>
                                        <strong>{address.label}</strong><span>{address.address_line}</span>{address.is_default ? <em>Default</em> : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {!formCheckout.address.trim() && recentOrderAddresses.length > 0 ? (
                            <div className="checkout__address-recommendations" aria-live="polite">
                                <div className="checkout__address-recommendations__header">
                                    <strong>{t("checkout.recentAddressTitle")}</strong>
                                    <span>{t("checkout.recentAddressDescription")}</span>
                                </div>
                                <div className="checkout__address-recommendations__list">
                                    {recentOrderAddresses.map((address) => (
                                        <button
                                            key={`${address.orderId}-${address.address}-${address.city}`}
                                            type="button"
                                            aria-label={`Use address from order #${address.orderId}`}
                                            onClick={() => applyRecentOrderAddress(address)}
                                        >
                                            <strong>Order #{address.orderId}</strong>
                                            <span>{formatShippingAddress(address)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <Form>
                            <div className="checkout__field-grid">
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formFirstName">
                                        <Form.Label htmlFor="checkout-first-name">{t("checkout.firstName")}</Form.Label>
                                        <Form.Control id="checkout-first-name" type="text" name="first_name" placeholder={t("checkout.firstName")} autoComplete="given-name" required value={formCheckout.first_name} onChange={handleInputChange} />
                                    </Form.Group>
                                </div>
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formLastName">
                                        <Form.Label htmlFor="checkout-last-name">{t("checkout.lastName")}</Form.Label>
                                        <Form.Control id="checkout-last-name" type="text" name="last_name" placeholder={t("checkout.lastName")} autoComplete="family-name" required value={formCheckout.last_name} onChange={handleInputChange} />
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Group className="mb-3" controlId="formShippingAddress">
                                <Form.Label htmlFor="checkout-address">{t("checkout.address")}</Form.Label>
                                <Form.Control id="checkout-address" type="text" name="address" placeholder={t("checkout.address")} autoComplete="street-address" required value={formCheckout.address} onChange={handleInputChange} />
                            </Form.Group>
                            <div className="checkout__field-grid">
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formCity">
                                        <Form.Label htmlFor="checkout-city">{t("checkout.city")}</Form.Label>
                                        <Form.Control id="checkout-city" type="text" name="city" placeholder={t("checkout.city")} autoComplete="address-level2" required value={formCheckout.city} onChange={handleInputChange} />
                                    </Form.Group>
                                </div>
                                <div className="checkout__field">
                                    <Form.Group className="mb-3" controlId="formCountry">
                                        <Form.Label htmlFor="checkout-country">{t("checkout.country")}</Form.Label>
                                        <Form.Control id="checkout-country" type="text" name="country" placeholder={t("checkout.country")} autoComplete="country-name" value={formCheckout.country || ""} onChange={handleInputChange} />
                                    </Form.Group>
                                </div>
                            </div>
                            <Form.Group className="mb-3" controlId="formPhoneNumber">
                                <Form.Label htmlFor="checkout-phone">{t("checkout.phone")}</Form.Label>
                                <Form.Control id="checkout-phone" type="tel" name="phone_number" placeholder={t("checkout.phone")} autoComplete="tel" value={formCheckout.phone_number || ""} onChange={handleInputChange} />
                            </Form.Group>
                        </Form>
                    </div>

                    <div className="checkout__card">
                        <div className="checkout__card__header"><h2><span>03</span>{t("checkout.payment")}</h2><p>{t("checkout.paymentDescription")}</p></div>
                        <Form className="checkout__payment">
                            <div className="checkout__payment__methods" role="radiogroup" aria-label={t("checkout.paymentMethod")}>
                                {paymentOptions.map((option) => (
                                    <label key={option.value} className={formCheckout.payment_method === option.value ? `checkout__payment__method checkout__payment__method--${option.value} is-active` : `checkout__payment__method checkout__payment__method--${option.value}`} htmlFor={`payment-${option.value}`}>
                                        <input type="radio" id={`payment-${option.value}`} name="payment_method" value={option.value} checked={formCheckout.payment_method === option.value} onChange={handleInputChange} />
                                        <span className="checkout__payment__method__check"><CheckCircleIcon size={18} /></span>
                                        <span className="checkout__payment__method__icon">{option.icon}</span>
                                        <span className="checkout__payment__method__content"><strong>{option.title}</strong><small>{option.description}</small></span>
                                    </label>
                                ))}
                            </div>
                            <div className="checkout__payment__selected"><span>{t("checkout.selectedMethod")}</span><strong>{selectedPayment.title}</strong></div>
                            {formCheckout.payment_method === PAYMENT_METHOD.PAYOS ? (
                                <div className="checkout__payment__details">
                                    <h3>{t("checkout.payos")}</h3>
                                    <p>{t("checkout.payosDescription")}</p>
                                    <p>{t("checkout.payosConfirmation")}</p>
                                </div>
                            ) : (
                                <div className="checkout__payment__details">
                                    <h3>{t("checkout.cashOnDelivery")}</h3>
                                    <p>{t("checkout.cashDescription")}</p>
                                    <p>{t("checkout.cashConfirmation")}</p>
                                </div>
                            )}
                        </Form>
                    </div>
                </section>

                <aside className="checkout__summary">
                    <div className="checkout__summary__card">
                        <p className="checkout__summary__eyebrow">{t("checkout.orderSummary")}</p>
                        <h2>{t("checkout.orderSummary")}</h2>
                        <div className="checkout__summary__badge"><ShieldIcon size={16} /><span>{t("checkout.stockPriceCheck")}</span></div>
                        <div className="checkout__summary__list">
                            {cart.slice(0, 3).map((item) => (
                                <div key={item.cartItemId} className="checkout__summary__item">
                                    <div><strong>{item.productName}</strong><span>{item.quantity} x {formatCurrency(item.sale_price ?? item.price)}</span></div>
                                    <span>{formatCurrency(item.quantity * (item.sale_price ?? item.price))}</span>
                                </div>
                            ))}
                            {cart.length > 3 ? <div className="checkout__summary__more">{t("checkout.moreItems", cart.length - 3)}</div> : null}
                        </div>
                        <div className="checkout__summary__rows">
                            <div><span>{t("checkout.subtotal")}</span><strong>{formatCurrency(totalPrice)}</strong></div>
                            <div><span>{t("checkout.shipping")}</span><strong className="free">{t("checkout.free")}</strong></div>
                            <div><span>{t("checkout.discount")}</span><strong className="muted">−{formatCurrency(discount)}</strong></div>
                        </div>
                        <div className="checkout__summary__total"><span>{t("checkout.total")}</span><strong>{formatCurrency(totalPrice - discount)}</strong></div>
                        <button type="button" onClick={handlePurchase} disabled={isSubmitting || isValidatingCart || hasValidationIssues}>
                            {isSubmitting ? t("checkout.placingOrder") : isValidatingCart ? t("checkout.checkingStockButton") : formCheckout.payment_method === PAYMENT_METHOD.PAYOS ? t("checkout.continueToPayOS") : t("checkout.placeOrder")}
                        </button>
                        <p className="checkout__summary__footnote">{t("checkout.policyFootnote")}</p>
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default CheckoutPaymentPage;
