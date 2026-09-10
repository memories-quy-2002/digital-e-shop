import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CashStackIcon, CheckCircleIcon, ShieldIcon } from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import { confirmMockPayOSPayment } from "../api";
import { formatCurrency } from "../../../utils/currency";
import "../../../styles/features/orders/_mock-payos.scss";

const parsePositiveInteger = (value: string | null) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const MockPayOSCheckoutPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderCode = parsePositiveInteger(searchParams.get("payos_order_code"));
    const amount = parsePositiveInteger(searchParams.get("amount"));
    const paymentLinkId = searchParams.get("payment_link_id")?.trim() || "";
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const isValidCheckout = Boolean(orderCode && amount && paymentLinkId);

    const handleConfirm = async () => {
        if (!orderCode || !amount || !paymentLinkId) return;

        try {
            setIsSubmitting(true);
            setError("");
            await confirmMockPayOSPayment({ orderCode, paymentLinkId, amount });
            navigate(`/checkout-success?payment_provider=payos&payos_order_code=${orderCode}`, { replace: true });
        } catch (requestError: unknown) {
            const responseMessage = requestError && typeof requestError === "object" && "response" in requestError
                ? (requestError as { response?: { data?: { msg?: string } } }).response?.data?.msg
                : undefined;
            setError(responseMessage || "The simulated payment could not be confirmed. Please start checkout again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>PayOS test checkout | Digital-E</title>
                <meta name="description" content="Complete a local PayOS payment simulation for Digital-E development." />
            </Helmet>
            <main className="mock-payos">
                <section className="mock-payos__shell" aria-labelledby="mock-payos-title">
                    <div className="mock-payos__brand">
                        <span className="mock-payos__brand-mark"><CashStackIcon size={22} /></span>
                        <div>
                            <strong>PayOS</strong>
                            <span>Local payment simulator</span>
                        </div>
                    </div>

                    {!isValidCheckout ? (
                        <div className="mock-payos__alert" role="alert">
                            This simulated checkout link is invalid or has expired. Please return to checkout and try again.
                        </div>
                    ) : (
                        <>
                            <div className="mock-payos__heading">
                                <span className="mock-payos__eyebrow">Development payment flow</span>
                                <h1 id="mock-payos-title">Confirm your PayOS payment</h1>
                                <p>This is a local simulator. No money will be transferred and no real PayOS account is charged.</p>
                            </div>

                            <div className="mock-payos__amount" aria-label="Payment amount">
                                <span>Total to pay</span>
                                <strong>{formatCurrency(amount)}</strong>
                                <small>Vietnamese dong · VND</small>
                            </div>

                            <dl className="mock-payos__details">
                                <div><dt>Order code</dt><dd>{orderCode}</dd></div>
                                <div><dt>Payment link</dt><dd>{paymentLinkId}</dd></div>
                                <div><dt>Environment</dt><dd>Mock / local only</dd></div>
                            </dl>

                            {error ? <div className="mock-payos__alert" role="alert">{error}</div> : null}

                            <div className="mock-payos__trust">
                                <ShieldIcon size={18} />
                                <span>The order remains pending until you explicitly confirm this simulated payment.</span>
                            </div>

                            <div className="mock-payos__actions">
                                <button type="button" className="mock-payos__confirm" onClick={() => void handleConfirm()} disabled={isSubmitting}>
                                    <CheckCircleIcon size={18} />
                                    {isSubmitting ? "Confirming..." : "Simulate payment success"}
                                </button>
                                <Link to="/cart?payment=cancelled" className="mock-payos__cancel">Cancel and return to cart</Link>
                            </div>
                        </>
                    )}
                </section>
            </main>
        </Layout>
    );
};

export default MockPayOSCheckoutPage;
