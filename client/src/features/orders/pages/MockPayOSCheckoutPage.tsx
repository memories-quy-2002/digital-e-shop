import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CashStackIcon, CheckCircleIcon, ShieldIcon } from "../../../components/common/Icons";
import Layout from "../../../components/layout/Layout";
import { confirmMockPayOSPayment } from "../api";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { useCustomerJourneyCopy } from "../../../hooks/useCustomerJourneyCopy";
import "../../../styles/features/orders/_mock-payos.scss";

const parsePositiveInteger = (value: string | null) => {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const MockPayOSCheckoutPage = () => {
    const { mockPayOS } = useCustomerJourneyCopy();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const orderCode = parsePositiveInteger(searchParams.get("payos_order_code"));
    const amount = parsePositiveInteger(searchParams.get("amount"));
    const paymentLinkId = searchParams.get("payment_link_id")?.trim() || "";
    const attemptId = searchParams.get("payment_attempt_id")?.trim() || "";
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState("");

    const isValidCheckout = Boolean(
        orderCode && amount && paymentLinkId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId),
    );

    const handleConfirm = async () => {
        if (!orderCode || !amount || !paymentLinkId || !isValidCheckout) return;

        try {
            setIsSubmitting(true);
            setError("");
            await confirmMockPayOSPayment({ paymentAttemptId: attemptId, orderCode, paymentLinkId, amount });
            navigate(`/checkout-success?payment_provider=payos&payment_attempt_id=${encodeURIComponent(attemptId)}`, { replace: true });
        } catch (requestError: unknown) {
            setError(getApiErrorMessage(requestError, mockPayOS.errorFallback));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <Helmet>
                <title>{mockPayOS.title}</title>
                <meta name="description" content={mockPayOS.metaDescription} />
            </Helmet>
            <main className="mock-payos">
                <section className="mock-payos__shell" aria-labelledby="mock-payos-title">
                    <div className="mock-payos__brand">
                        <span className="mock-payos__brand-mark"><CashStackIcon size={22} /></span>
                        <div>
                            <strong>PayOS</strong>
                            <span>{mockPayOS.localSimulator}</span>
                        </div>
                    </div>

                    {!isValidCheckout ? (
                        <div className="mock-payos__alert" role="alert">
                            {mockPayOS.invalidLink}
                        </div>
                    ) : (
                        <>
                            <div className="mock-payos__heading">
                                <span className="mock-payos__eyebrow">{mockPayOS.developmentFlow}</span>
                                <h1 id="mock-payos-title">{mockPayOS.heading}</h1>
                                <p>{mockPayOS.description}</p>
                            </div>

                            <div className="mock-payos__amount" aria-label={mockPayOS.amountAria}>
                                <span>{mockPayOS.totalToPay}</span>
                                <strong>{formatCurrency(amount)}</strong>
                                <small>{mockPayOS.currency}</small>
                            </div>

                            <dl className="mock-payos__details">
                                <div><dt>{mockPayOS.orderCode}</dt><dd>{orderCode}</dd></div>
                                <div><dt>{mockPayOS.paymentLink}</dt><dd>{paymentLinkId}</dd></div>
                                <div><dt>{mockPayOS.environment}</dt><dd>{mockPayOS.environmentValue}</dd></div>
                            </dl>

                            {error ? <div className="mock-payos__alert" role="alert">{error}</div> : null}

                            <div className="mock-payos__trust">
                                <ShieldIcon size={18} />
                                <span>{mockPayOS.confirmationPending}</span>
                            </div>

                            <div className="mock-payos__actions">
                                <button type="button" className="mock-payos__confirm" onClick={() => void handleConfirm()} disabled={isSubmitting}>
                                    <CheckCircleIcon size={18} />
                                    {isSubmitting ? mockPayOS.confirming : mockPayOS.simulateSuccess}
                                </button>
                                <Link to="/cart?payment=cancelled" className="mock-payos__cancel">{mockPayOS.cancel}</Link>
                            </div>
                        </>
                    )}
                </section>
            </main>
        </Layout>
    );
};

export default MockPayOSCheckoutPage;
