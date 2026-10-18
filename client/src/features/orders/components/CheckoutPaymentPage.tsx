import React, { useCallback, useEffect, useRef, useState } from "react";
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
    fingerprintPayOSRequest,
    getOrCreatePayOSSubmission,
    maskPhoneNumber,
    writeCheckoutSuccess,
    writePendingCheckout,
} from "../pages/checkoutSuccessStorage";
import { normalizeCheckoutEmail, validateCheckoutEmail, validateCheckoutForm } from "../checkoutValidation";
import { getApiErrorMessage, getApiErrorPayload } from "../../../lib/api-contract";
import { getRecentOrderAddresses, serializeShippingAddress, type RecentOrderAddress } from "../shippingAddress";
import { formatCurrency } from "../../../utils/currency";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import type { DeliveryAddress, InternalDeliveryQuote } from "../../shipping/types";
import CheckoutDeliverySection, { type DeliveryAddressPrefill } from "./CheckoutDeliverySection";
import { fetchCustomerAddresses, updateCustomerAddressLocation } from "../../users/api";
import type { CustomerAddress } from "../../users/types";
import { fetchLoyaltyOverview } from "../../loyalty/api";
import type { LoyaltyOverview } from "../../loyalty/types";

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
    const { locale } = useLocale();
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
    const [isValidatingCart, setIsValidatingCart] = useState(false);
    const [isEmailTouched, setIsEmailTouched] = useState(false);
    const [verificationRequired, setVerificationRequired] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState<DeliveryAddress | null>(null);
    const [shippingQuote, setShippingQuote] = useState<InternalDeliveryQuote | null>(null);
    const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
    const [recentAddresses, setRecentAddresses] = useState<RecentOrderAddress[]>([]);
    const [savedAddressesError, setSavedAddressesError] = useState(false);
    const [recentAddressesError, setRecentAddressesError] = useState(false);
    const [savedAddressPrefill, setSavedAddressPrefill] = useState<DeliveryAddressPrefill | null>(null);
    const [recentAddressPrefill, setRecentAddressPrefill] = useState<DeliveryAddressPrefill | null>(null);
    const [quoteResetKey, setQuoteResetKey] = useState(0);
    const [quoteInvalidationKey, setQuoteInvalidationKey] = useState(0);
    const [loyalty, setLoyalty] = useState<LoyaltyOverview | null>(null);
    const [loyaltyLoadFailed, setLoyaltyLoadFailed] = useState(false);
    const [loyaltyPointsInput, setLoyaltyPointsInput] = useState("0");
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
    useEffect(() => {
        cartRef.current = cart;
    }, [cart]);

    useEffect(() => {
        let active = true;
        setSavedAddressPrefill(null);
        setRecentAddressPrefill(null);
        setSavedAddresses([]);
        setRecentAddresses([]);
        setSavedAddressesError(false);
        setRecentAddressesError(false);
        if (!uid) return () => { active = false; };

        void fetchCustomerAddresses(uid)
            .then((addresses) => { if (active) setSavedAddresses(addresses); })
            .catch(() => { if (active) setSavedAddressesError(true); });
        void fetchCustomerOrders(uid)
            .then((orders) => { if (active) setRecentAddresses(getRecentOrderAddresses(orders)); })
            .catch(() => { if (active) setRecentAddressesError(true); });
        return () => { active = false; };
    }, [uid]);

    useEffect(() => {
        let active = true;
        setLoyalty(null);
        setLoyaltyLoadFailed(false);
        setLoyaltyPointsInput("0");
        if (!uid) return () => { active = false; };
        void fetchLoyaltyOverview()
            .then((result) => { if (active) setLoyalty(result); })
            .catch(() => { if (active) setLoyaltyLoadFailed(true); });
        return () => { active = false; };
    }, [uid]);

    useEffect(() => {
        if (!userData?.email || formCheckout.email) return;
        setFormCheckout((current) => ({ ...current, email: userData.email }));
    }, [formCheckout.email, userData?.email]);

    const checkoutEmail = uid ? userData?.email || "" : formCheckout.email;
    const emailError = validateCheckoutEmail(checkoutEmail);
    const showEmailError = isEmailTouched && Boolean(emailError);

    const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = event.target;
        setFormCheckout((current) => ({ ...current, [name]: value }));
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
        const normalizedEmail = normalizeCheckoutEmail(checkoutEmail);
        const normalizedName = `${formCheckout.first_name} ${formCheckout.last_name}`.trim();

        return {
            latestCart,
            latestTotalPrice: Math.round(latestCart.reduce(
                (sum, item) => sum + (item.sale_price ?? item.price) * item.quantity,
                0,
            )),
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

    const handleShippingQuote = useCallback((address: DeliveryAddress | null, quote: InternalDeliveryQuote | null) => {
        if (address) setDeliveryAddress(address);
        setShippingQuote(quote);
        if (address) {
            const [firstName = "", ...lastName] = address.recipientName.split(" ");
            setFormCheckout((current) => ({ ...current, first_name: firstName, last_name: lastName.join(" "), address: address.addressLine, city: address.city, country: "VN", phone_number: address.recipientPhone }));
        }
    }, []);

    const chooseAddress = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const [source, id] = event.target.value.split(":", 2);
        if (source === "saved") {
            const address = savedAddresses.find((item) => String(item.id) === id);
            setRecentAddressPrefill(null);
            setSavedAddressPrefill(address ? {
                key: `saved:${address.id}`,
                recipientName: address.recipient_name || undefined,
                recipientPhone: address.phone_number || undefined,
                addressLine: address.address_line,
                city: address.city || address.province_name || undefined,
                latitude: address.latitude,
                longitude: address.longitude,
            } : null);
            return;
        }

        const address = source === "recent" ? recentAddresses.find((item) => String(item.orderId) === id) : undefined;
        setSavedAddressPrefill(null);
        setRecentAddressPrefill(address ? { key: `recent:${address.orderId}`, addressLine: address.address, city: address.city } : null);
    };

    const persistConfirmedAddressLocation = useCallback(async (point: { latitude: number; longitude: number }, addressLine: string, city: string): Promise<boolean> => {
        const selected = savedAddressPrefill?.key.startsWith("saved:")
            ? savedAddresses.find((address) => String(address.id) === savedAddressPrefill.key.slice("saved:".length))
            : undefined;
        if (!uid || !selected) return false;
        const sameAddress = selected.address_line.trim().toLocaleLowerCase() === addressLine.trim().toLocaleLowerCase()
            && (selected.city || selected.province_name || "").trim().toLocaleLowerCase() === city.trim().toLocaleLowerCase();
        if (!sameAddress) return false;
        await updateCustomerAddressLocation(uid, selected.id, point.latitude, point.longitude);
        setSavedAddresses((current) => current.map((address) => address.id === selected.id
            ? { ...address, latitude: point.latitude, longitude: point.longitude }
            : address));
        return true;
    }, [uid, savedAddressPrefill, savedAddresses]);

    const quoteIsValid = Boolean(shippingQuote && deliveryAddress && Date.parse(shippingQuote.expiresAt) > Date.now());
    const loyaltyPointsNumber = Number(loyaltyPointsInput);
    const requestedLoyaltyPoints = Number.isFinite(loyaltyPointsNumber) ? Math.max(0, Math.floor(loyaltyPointsNumber)) : 0;
    const merchandiseSubtotal = shippingQuote?.pricing.itemsSubtotal ?? totalPrice;
    const promotionDiscount = shippingQuote?.pricing.merchandiseDiscount ?? discount;
    const maximumLoyaltyPoints = uid && loyalty
        ? Math.max(0, Math.min(loyalty.balancePoints, merchandiseSubtotal - promotionDiscount))
        : 0;
    const appliedLoyaltyPoints = Math.min(requestedLoyaltyPoints, maximumLoyaltyPoints);
    const invalidLoyaltyPoints = uid !== null && uid !== undefined && (
        !Number.isSafeInteger(loyaltyPointsNumber)
        || loyaltyPointsNumber < 0
        || requestedLoyaltyPoints > maximumLoyaltyPoints
    );
    const totalAfterLoyalty = Math.max((shippingQuote?.pricing.payableTotal ?? Math.max(totalPrice - discount, 0)) - appliedLoyaltyPoints, 0);

    const submitPayOSCheckout = async (submission: CheckoutSubmissionContext) => {
        const cartSnapshot = submission.latestCart.map(({ productId, quantity }) => ({ productId, quantity }));
        let pendingCheckout: ReturnType<typeof getOrCreatePayOSSubmission>;
        let sessionResponse: { attemptId: string; orderCode: number; url: string | null; guestOrderToken?: string };

        if (uid) {
            const request = {
                cart: submission.latestCart,
                totalPrice: submission.latestTotalPrice,
                discount,
                discountCode: discountCode || undefined,
                loyaltyPoints: appliedLoyaltyPoints,
                shippingAddress: serializeShippingAddress(submission.guestShipping),
                shippingQuoteId: shippingQuote!.id,
                deliveryAddress: deliveryAddress!,
                locale,
            };
            pendingCheckout = getOrCreatePayOSSubmission(await fingerprintPayOSRequest(request), cartSnapshot);
            sessionResponse = await createPayOSCheckoutSession(uid, request, pendingCheckout.idempotencyKey);
        } else {
            const request = {
                cart: submission.guestCart,
                contact: submission.guestContact,
                shipping: submission.guestShipping,
                discountCode: discountCode || undefined,
                paymentMethod: PAYMENT_METHOD.PAYOS,
                shippingQuoteId: shippingQuote!.id,
                deliveryAddress: deliveryAddress!,
                locale,
            };
            pendingCheckout = getOrCreatePayOSSubmission(await fingerprintPayOSRequest(request), cartSnapshot);
            sessionResponse = await createGuestPayOSCheckoutSession(request, pendingCheckout.idempotencyKey);
        }

        writePendingCheckout({
            ...pendingCheckout,
            attemptId: sessionResponse.attemptId,
            providerOrderCode: String(sessionResponse.orderCode),
            ...(!uid && sessionResponse.guestOrderToken ? { guestOrderToken: sessionResponse.guestOrderToken } : {}),
        });
        if (sessionResponse.url) {
            window.location.href = sessionResponse.url;
            return;
        }
        navigate(`/checkout-success?payment_attempt_id=${encodeURIComponent(sessionResponse.attemptId)}`);
    };

    const submitGuestOrder = async (submission: CheckoutSubmissionContext) => {
        const response = await createGuestPurchase({
            cart: submission.guestCart,
            contact: submission.guestContact,
            shipping: submission.guestShipping,
            discountCode: discountCode || undefined,
            paymentMethod: formCheckout.payment_method,
            shippingQuoteId: shippingQuote!.id,
            deliveryAddress: deliveryAddress!,
            locale,
        });
        const orderTotal = Number(response.order?.total_price);
        const orderDiscount = Number(response.order?.discount);
        const resolvedTotal = Number.isFinite(orderTotal) ? orderTotal : submission.latestTotalPrice;
        const resolvedDiscount = Number.isFinite(orderDiscount) ? orderDiscount : discount;
        const payload = {
            orderId: String(response.orderId || response.order?.id),
            totalPrice: resolvedTotal,
            discount: resolvedDiscount,
            subtotal: shippingQuote!.pricing.itemsSubtotal,
            shippingFee: shippingQuote!.pricing.shippingFee,
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
            loyaltyPoints: appliedLoyaltyPoints,
            shippingQuoteId: shippingQuote!.id,
            deliveryAddress: deliveryAddress!,
            locale,
        });
        if (response.status !== HTTP_STATUS.CREATED) return;

        const orderId = response.data?.order?.id || response.data?.orderId || response.data?.id || `ORD-${Date.now()}`;
        const placedAt = response.data?.order?.date_added || response.data?.placedAt || toUtcIsoString();
        const payload = {
            orderId,
            totalPrice: shippingQuote!.pricing.itemsSubtotal + shippingQuote!.pricing.shippingFee,
            discount: Number.isFinite(Number(response.data?.order?.discount))
                ? Number(response.data.order.discount)
                : discount + appliedLoyaltyPoints,
            subtotal: shippingQuote!.pricing.itemsSubtotal,
            shippingFee: shippingQuote!.pricing.shippingFee,
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
        clearPendingCheckout();
        navigate("/checkout-success", { state: { checkoutSuccess: payloadSensitive } });
    };

    const handlePurchaseFailure = (err: unknown) => {
        if (err && typeof err === "object" && "response" in err) {
            const payload = getApiErrorPayload(err);
            const status = (err as { response?: { status?: number } }).response?.status;
            if (["DELIVERY_QUOTE_EXPIRED", "DELIVERY_QUOTE_CHANGED", "DELIVERY_QUOTE_INVALID", "DELIVERY_SETTINGS_CHANGED"].includes(String(payload?.code || ""))) {
                setShippingQuote(null);
                setQuoteInvalidationKey((current) => current + 1);
                const message = t("shipping.quoteInvalidated");
                setErrors([message]);
                addToast(t("checkout.title"), message);
                return;
            }
            if (status === HTTP_STATUS.CONFLICT) clearPendingCheckout();
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
                : getApiErrorMessage(
                    err,
                    status === HTTP_STATUS.CONFLICT ? t("checkout.checkoutDraftChanged") : t("checkout.checkoutError"),
                );
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
        if (!quoteIsValid || !shippingQuote || !deliveryAddress) {
            setErrors([t("shipping.quoteRequired")]);
            return;
        }
        if (invalidLoyaltyPoints) {
            setErrors([t("checkout.loyaltyPointsInvalid")]);
            return;
        }

        const latestCart = await validateCartStock();
        if (!latestCart) return;

        const latestSubtotal = Math.round(latestCart.reduce((sum, item) => sum + (item.sale_price ?? item.price) * item.quantity, 0));
        if (latestSubtotal !== shippingQuote.pricing.itemsSubtotal || discount !== shippingQuote.pricing.merchandiseDiscount) {
            setShippingQuote(null);
            setDeliveryAddress(null);
            setQuoteResetKey((current) => current + 1);
            setErrors([t("checkout.priceChanged")]);
            return;
        }

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
                    <div><strong>{formatCurrency(totalAfterLoyalty)}</strong><span>{t("checkout.totalDue")}</span></div>
                </div>
            </div>

            <div className="checkout__layout">
                <section className="checkout__form">
                    {loading ? <div className="checkout__note">{t("checkout.checkingSession")}</div> : null}
                    {isValidatingCart ? <div className="checkout__note">{t("checkout.checkingStock")}</div> : null}
                    {errors.length > 0 ? <div className="checkout__alert" role="alert" aria-live="assertive">{errors.map((error, id) => <span key={id}>{error}</span>)}</div> : null}
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
                                    value={checkoutEmail}
                                    readOnly={Boolean(uid)}
                                    onChange={uid ? undefined : handleInputChange}
                                    onBlur={uid ? undefined : () => setIsEmailTouched(true)}
                                    aria-invalid={showEmailError}
                                    aria-describedby={showEmailError ? "checkout-email-error" : undefined}
                                />
                                {showEmailError ? <small id="checkout-email-error" className="checkout__field-error">{emailError}</small> : null}
                                {uid ? <small>{t("checkout.accountEmailHint")}</small> : null}
                            </Form.Group>
                        </Form>
                    </div>

                    <CheckoutDeliverySection
                        uid={uid}
                        cart={cart}
                        discountCode={discountCode}
                        savedAddresses={savedAddresses}
                        recentAddresses={recentAddresses}
                        savedAddressesError={savedAddressesError}
                        recentAddressesError={recentAddressesError}
                        savedAddressPrefill={savedAddressPrefill}
                        recentAddressPrefill={recentAddressPrefill}
                        resetKey={quoteResetKey}
                        invalidateQuoteKey={quoteInvalidationKey}
                        onAddressChange={chooseAddress}
                        onQuoteChange={handleShippingQuote}
                        onCoordinatesConfirmed={persistConfirmedAddressLocation}
                    />

                    {uid ? (
                        <section className="checkout__loyalty" aria-labelledby="checkout-loyalty-heading">
                            <h2 id="checkout-loyalty-heading">{t("checkout.loyaltyPoints")}</h2>
                            {loyaltyLoadFailed ? (
                                <p className="checkout__loyalty__message" role="status">{t("checkout.loyaltyLoadError")}</p>
                            ) : loyalty ? (
                                <>
                                    <p>{t("checkout.loyaltyBalance", loyalty.balancePoints)}</p>
                                    <label htmlFor="checkout-loyalty-points">{t("checkout.loyaltyPoints")}</label>
                                    <input
                                        id="checkout-loyalty-points"
                                        name="loyaltyPoints"
                                        type="number"
                                        min="0"
                                        max={maximumLoyaltyPoints}
                                        step="1"
                                        inputMode="numeric"
                                        value={loyaltyPointsInput}
                                        onChange={(event) => setLoyaltyPointsInput(event.target.value)}
                                        aria-describedby="checkout-loyalty-hint"
                                        aria-invalid={invalidLoyaltyPoints}
                                    />
                                    <small id="checkout-loyalty-hint">{t("checkout.loyaltyPointValue")}</small>
                                </>
                            ) : (
                                <p className="checkout__loyalty__message" role="status">{t("checkout.checkingLoyalty")}</p>
                            )}
                        </section>
                    ) : null}

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
                            <div><span>{t("checkout.shipping")}</span><strong>{shippingQuote ? formatCurrency(shippingQuote.pricing.shippingFee) : t("shipping.quoteRequired")}</strong></div>
                            <div><span>{t("checkout.discount")}</span><strong className="muted">−{formatCurrency(discount)}</strong></div>
                            {appliedLoyaltyPoints > 0 ? <div><span>{t("checkout.loyaltyDiscount")}</span><strong className="muted">−{formatCurrency(appliedLoyaltyPoints)}</strong></div> : null}
                        </div>
                        <div className="checkout__summary__total"><span>{t("checkout.total")}</span><strong>{formatCurrency(totalAfterLoyalty)}</strong></div>
                        <button type="button" onClick={handlePurchase} disabled={isSubmitting || isValidatingCart || hasValidationIssues || !quoteIsValid}>
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
