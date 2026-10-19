import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { CashStackIcon, CheckCircleIcon, ShieldIcon } from "../../../components/common/Icons";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { useToast } from "../../../context/ToastContext";
import { PAYMENT_METHOD, PAYMENT_STATUS, type PaymentMethod } from "../../orders/constants";
import { CURRENCY_CODE } from "../../../constants/currency";
import {
    PAYMENT_RECONCILIATION_LIMIT,
    PAYMENT_RECONCILIATION_STATUS,
    PAYMENT_RECONCILIATION_TARGET_TYPE,
} from "../payment-reconciliation.constants";
import {
    confirmAdminCodPayment,
    fetchPaymentReconciliationCandidates,
    fetchPaymentWebhookEvents,
    reconcileAdminPayment,
    runPaymentReconciliation,
    type PaymentReconciliationCandidate,
    type PaymentReconciliationPage,
    type PaymentReconciliationStatus,
    type PaymentWebhookEvent,
} from "../api";
import PrivateEvidenceUpload from "../components/PrivateEvidenceUpload";
import { recordPaymentAttemptRefund, fetchPaymentAttemptException, fetchPaymentAttemptExceptions, retryPaymentAttempt } from "../operations.api";
import type { PaymentAttemptException, PaymentAttemptExceptionDetail } from "../operations.types";
import { useAdminCopy } from "../../../hooks/useAdminCopy";
import { useLocale } from "../../../context/LocaleContext";

const PAGE_LIMIT = PAYMENT_RECONCILIATION_LIMIT.DEFAULT;
const reconciliationStatuses: Array<PaymentReconciliationStatus | ""> = [
    "",
    ...Object.values(PAYMENT_RECONCILIATION_STATUS),
];

const emptyPage: PaymentReconciliationPage = {
    candidates: [],
    pagination: { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 0 },
};

const formatVnd = (value: number | null) => value === null
    ? "—"
    : new Intl.NumberFormat("vi-VN", {
        style: "currency",
        currency: CURRENCY_CODE.VND,
        maximumFractionDigits: 0,
    }).format(value);

const formatDate = (value: string | null, locale: string) => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === "vi" ? "vi-VN" : "en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
    });
};

const labelProvider = (provider: string) => provider === PAYMENT_METHOD.PAYOS ? "PayOS" : provider === PAYMENT_METHOD.CASH ? "COD" : provider;
const labelTarget = (candidate: PaymentReconciliationCandidate, tx: (source: string) => string) => candidate.orderId
    ? `${tx("Order")} #${candidate.orderId}`
    : candidate.targetType === PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT ? `${tx("Pending checkout")} #${candidate.targetId}` : `${tx("Payment")} #${candidate.targetId}`;
const statusClass = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

const formatAttemptDate = (value: string, locale: string) => new Date(value).toLocaleString(locale === "vi" ? "vi-VN" : "en-GB");

const PaymentAttemptExceptions = () => {
    const tx = useAdminCopy();
    const { locale } = useLocale();
    const [items, setItems] = useState<PaymentAttemptException[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [selectedId, setSelectedId] = useState("");
    const [detail, setDetail] = useState<PaymentAttemptExceptionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailLoading, setDetailLoading] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState("");
    const [refundAmount, setRefundAmount] = useState("");
    const [transferReference, setTransferReference] = useState("");
    const [transferDate, setTransferDate] = useState("");
    const [refundReason, setRefundReason] = useState("");
    const [evidence, setEvidence] = useState<import("../operations.types").FinancialEvidence | null>(null);
    const [notice, setNotice] = useState("");
    const refundIdempotency = useRef<{ fingerprint: string; key: string } | null>(null);

    const loadQueue = useCallback(async (nextPage = 1) => {
        setLoading(true);
        setError("");
        try {
            const result = await fetchPaymentAttemptExceptions(nextPage, 25);
            setItems(result.items);
            setTotalPages(result.pagination.totalPages);
            setPage(result.pagination.page);
            setSelectedId((currentId) => currentId && result.items.some((item) => item.attemptId === currentId) ? currentId : "");
            setDetail((currentDetail) => currentDetail && result.items.some((item) => item.attemptId === currentDetail.attemptId) ? currentDetail : null);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void loadQueue(1); }, [loadQueue]);

    useEffect(() => {
        if (!selectedId) return;
        let active = true;
        setDetailLoading(true);
        setDetail(null);
        void fetchPaymentAttemptException(selectedId).then((value) => {
            if (active) setDetail(value);
        }).catch((requestError) => {
            if (active) setError(getAdminRequestError(requestError).message);
        }).finally(() => {
            if (active) setDetailLoading(false);
        });
        return () => { active = false; };
    }, [selectedId]);

    const runRetry = async () => {
        if (!detail || !reason.trim() || busy) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await retryPaymentAttempt(detail.attemptId, reason.trim());
            setNotice(tx("Fulfillment retry completed. The order was created from the verified payment."));
            setReason("");
            await loadQueue(page);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message);
        } finally {
            setBusy(false);
        }
    };

    const submitRefund = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!detail || !evidence || busy) return;
        const amountVnd = Number(refundAmount);
        if (!Number.isSafeInteger(amountVnd) || amountVnd <= 0 || amountVnd > detail.refundableAmountVnd) return;
        const fingerprint = [detail.attemptId, amountVnd, transferReference.trim(), transferDate, evidence.id, refundReason.trim()].join("|");
        const idempotencyKey = refundIdempotency.current?.fingerprint === fingerprint
            ? refundIdempotency.current.key
            : crypto.randomUUID();
        refundIdempotency.current = { fingerprint, key: idempotencyKey };
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const result = await recordPaymentAttemptRefund(detail.attemptId, {
                amountVnd,
                transferReference: transferReference.trim(),
                idempotencyKey,
                transferredAt: transferDate,
                evidenceId: evidence.id,
                reason: refundReason.trim(),
            });
            setNotice(`${tx(result.replayed ? "Refund record already exists" : "Refund recorded")}. ${tx(result.resolutionState === "RESOLVED" ? "Exception resolved." : "Partial refund; remaining balance stays open.")}`);
            setEvidence(null);
            refundIdempotency.current = null;
            setRefundAmount("");
            setTransferReference("");
            setTransferDate("");
            setRefundReason("");
            const updated = await fetchPaymentAttemptException(detail.attemptId);
            setDetail(updated);
            await loadQueue(page);
        } catch (requestError) {
            setError(getAdminRequestError(requestError).message);
        } finally {
            setBusy(false);
        }
    };

    return <section className="admin__card admin__payments__exceptions" aria-labelledby="payment-exceptions-title">
        <div className="admin__card__header admin__card__header--stacked">
            <div>
                <h2 id="payment-exceptions-title">{tx("Paid payment exceptions")}</h2>
                <p>{tx("Review verified PayOS payments without an order. Refunds require transfer evidence; fulfillment retry uses the verified payment amount.")}</p>
            </div>
            <button type="button" className="admin__button admin__button--ghost" onClick={() => void loadQueue()} disabled={loading || busy}>{tx("Refresh exceptions")}</button>
        </div>
        {error ? <div className="admin__alert" role="alert">{error}</div> : null}
        {notice ? <div className="admin__alert admin__payments__notice" role="status">{notice}</div> : null}
        {loading && items.length === 0 ? <AdminStatusPanel variant="loading" title={tx("Loading payment exceptions")} description={tx("Fetching unresolved verified PayOS payments.")} /> : null}
        {!loading && !error && items.length === 0 ? <AdminStatusPanel variant="empty" title={tx("No paid payment exceptions")} description={tx("Unresolved PayOS payments without an order will appear here.")} /> : null}
        {items.length ? <>
            <div className="admin__table-wrap admin__payments__exception-wrap" aria-busy={loading}>
                <table className="admin__table admin__payments__exception-table">
                    <caption className="admin__sr-only">{tx("Unresolved PayOS payment exceptions")}</caption>
                    <thead><tr><th scope="col">{tx("Attempt")}</th><th scope="col">{tx("Payment state")}</th><th scope="col">{tx("Expected")}</th><th scope="col">{tx("Received")}</th><th scope="col">{tx("Refundable")}</th><th scope="col">{tx("Updated")}</th><th scope="col">{tx("Details")}</th></tr></thead>
                    <tbody>{items.map((item) => <tr key={item.attemptId}>
                        <td><span className="admin__payments__attempt-id">{item.attemptId}</span><small>{tx("Order code")} {item.providerOrderCode}</small></td>
                        <td><span className={`admin__pill admin__pill--${statusClass(item.paymentState)}`}>{tx(item.paymentState)}</span><small>{tx(item.resolutionState)}</small></td>
                        <td>{formatVnd(item.expectedAmountVnd)}</td><td>{formatVnd(item.receivedAmountVnd)}</td><td>{formatVnd(item.refundableAmountVnd)}</td><td>{formatAttemptDate(item.updatedAt, locale)}</td>
                        <td><button type="button" className="admin__button admin__button--ghost admin__button--compact" aria-pressed={selectedId === item.attemptId} onClick={() => { setSelectedId(item.attemptId); setError(""); setNotice(""); }}>{tx("Review")}</button></td>
                    </tr>)}</tbody>
                </table>
            </div>
            <div className="admin__payments__pagination" aria-label={tx("Exception queue pagination")}>
                <span>{tx("Page")} {page} {tx("of")} {Math.max(1, totalPages)}</span><div>
                    <button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => void loadQueue(page - 1)} disabled={page <= 1 || loading || busy}>{tx("Previous")}</button>
                    <button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => void loadQueue(page + 1)} disabled={page >= totalPages || loading || busy}>{tx("Next")}</button>
                </div>
            </div>
        </> : null}
        {selectedId ? <section className="admin__payments__attempt-detail" aria-labelledby="payment-attempt-detail-title" aria-busy={detailLoading}>
            <h3 id="payment-attempt-detail-title">{tx("Payment attempt details")}</h3>
            {detailLoading ? <p role="status">{tx("Loading safe payment snapshot…")}</p> : null}
            {detail ? <>
                <dl className="admin__payments__attempt-summary">
                    <div><dt>{tx("Verified received")}</dt><dd>{formatVnd(detail.receivedAmountVnd)}</dd></div><div><dt>{tx("Refunded")}</dt><dd>{formatVnd(detail.refundedAmountVnd)}</dd></div><div><dt>{tx("Refundable balance")}</dt><dd>{formatVnd(detail.refundableAmountVnd)}</dd></div><div><dt>{tx("Resolution")}</dt><dd>{tx(detail.resolutionState)}</dd></div>
                </dl>
                <div className="admin__payments__snapshot"><h4>{tx("Purchased items")}</h4>{detail.items.length ? <ul>{detail.items.map((item) => <li key={item.productId}><span>{item.name} × {item.quantity}</span><strong>{formatVnd(item.unitPriceVnd * item.quantity)}</strong></li>)}</ul> : <p>{tx("No item snapshot was recorded.")}</p>}<p>{tx("Subtotal")} {formatVnd(detail.subtotalVnd)} · {tx("Discount")} {formatVnd(detail.discountVnd)} · {tx("Shipping")} {formatVnd(detail.shippingVnd)}</p><strong>{tx("Expected payment")} {formatVnd(detail.payableVnd)}</strong></div>
                {detail.refunds.length ? <div className="admin__payments__refund-history"><h4>{tx("Refund records")}</h4><ul>{detail.refunds.map((refund) => <li key={refund.operationId}>{formatVnd(refund.amountVnd)} · {refund.transferReference} · {refund.transferredAt} · {refund.reason}</li>)}</ul></div> : null}
                {detail.paymentState === "PAID" && detail.orderState !== "CREATED" ? <form className="admin__payments__retry-form" onSubmit={(event) => { event.preventDefault(); void runRetry(); }}>
                    <h4>{tx("Retry order creation")}</h4><p>{tx("Only use after confirming the order was not created. The server rechecks current eligibility and never changes the verified amount.")}</p>
                    <label htmlFor="payment-retry-reason">{tx("Fulfillment retry reason")}</label><textarea id="payment-retry-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required />
                    <button type="submit" className="admin__button admin__button--primary" disabled={busy || !reason.trim()}>{busy ? tx("Processing…") : tx("Retry fulfillment")}</button>
                </form> : null}
                {detail.refundableAmountVnd > 0 ? <form className="admin__payments__refund-form" onSubmit={(event) => void submitRefund(event)}>
                    <h4>{tx("Record an offline refund")}</h4><p>{tx("Record a bank transfer already made. This action does not initiate a provider refund. Maximum remaining balance:")} <strong>{formatVnd(detail.refundableAmountVnd)}</strong>.</p>
                    <label htmlFor="refund-amount">{tx("Refund amount (VND)")}</label><input id="refund-amount" type="number" min="1" max={detail.refundableAmountVnd} step="1" inputMode="numeric" required value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} />
                    <label htmlFor="refund-reference">{tx("Transfer reference")}</label><input id="refund-reference" value={transferReference} onChange={(event) => setTransferReference(event.target.value)} maxLength={191} required />
                    <label htmlFor="refund-date">{tx("Transfer date")}</label><input id="refund-date" type="date" value={transferDate} onChange={(event) => setTransferDate(event.target.value)} required />
                    <PrivateEvidenceUpload label={tx("Private transfer evidence")} evidence={evidence} onChange={setEvidence} />
                    <label htmlFor="refund-reason">{tx("Transfer refund reason")}</label><textarea id="refund-reason" value={refundReason} onChange={(event) => setRefundReason(event.target.value)} maxLength={500} required />
                    <button type="submit" className="admin__button admin__button--success" disabled={busy || !evidence || !Number.isSafeInteger(Number(refundAmount)) || Number(refundAmount) <= 0 || Number(refundAmount) > detail.refundableAmountVnd || !transferReference.trim() || !transferDate || !refundReason.trim()}>{busy ? tx("Recording…") : tx("Record transfer refund")}</button>
                </form> : <p className="admin__payments__resolved-note">{tx("No refundable balance remains.")}</p>}
            </> : null}
        </section> : null}
    </section>;
};

const AdminPaymentReconciliationPage = () => {
    const tx = useAdminCopy();
    const { locale } = useLocale();
    const { addToast } = useToast();
    const [provider, setProvider] = useState<"" | PaymentMethod>("");
    const [reconciliationStatus, setReconciliationStatus] = useState<"" | PaymentReconciliationStatus>("");
    const [currentPage, setCurrentPage] = useState(1);
    const [paymentPage, setPaymentPage] = useState<PaymentReconciliationPage>(emptyPage);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [busyAction, setBusyAction] = useState<string | null>(null);
    const [codNotes, setCodNotes] = useState<Record<number, string>>({});
    const [expandedPaymentId, setExpandedPaymentId] = useState<number | null>(null);
    const [webhookEvents, setWebhookEvents] = useState<Record<number, PaymentWebhookEvent[]>>({});
    const [webhookErrors, setWebhookErrors] = useState<Record<number, string>>({});

    const loadCandidates = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const result = await fetchPaymentReconciliationCandidates({
                page: currentPage,
                limit: PAGE_LIMIT,
                ...(provider ? { provider } : {}),
                ...(reconciliationStatus ? { reconciliationStatus } : {}),
            });
            setPaymentPage(result);
            setHasLoaded(true);
        } catch (error) {
            setLoadError(getAdminRequestError(error));
        } finally {
            setIsLoading(false);
        }
    }, [currentPage, provider, reconciliationStatus]);

    useEffect(() => {
        void loadCandidates();
    }, [loadCandidates]);

    const counts = useMemo(() => ({
        total: paymentPage.pagination.total,
        payos: paymentPage.candidates.filter((candidate) => candidate.provider === PAYMENT_METHOD.PAYOS).length,
        cash: paymentPage.candidates.filter((candidate) => candidate.provider === PAYMENT_METHOD.CASH).length,
        attention: paymentPage.candidates.filter((candidate) => candidate.reconciliationStatus === PAYMENT_RECONCILIATION_STATUS.MISMATCH
            || candidate.reconciliationStatus === PAYMENT_RECONCILIATION_STATUS.UNAVAILABLE).length,
    }), [paymentPage]);

    const runReconciliation = async () => {
        try {
            setBusyAction("run");
            setActionError(null);
            const result = await runPaymentReconciliation(PAYMENT_RECONCILIATION_LIMIT.MAX);
            const matched = result.results.filter((item) => item.outcome === PAYMENT_RECONCILIATION_STATUS.MATCHED).length;
            addToast("Payments", `${matched} of ${result.results.length} payment checks matched.`);
            await loadCandidates();
        } catch (error) {
            setActionError(getAdminRequestError(error).message);
            addToast("Payments", "Reconciliation run failed.");
        } finally {
            setBusyAction(null);
        }
    };

    const reconcilePayment = async (candidate: PaymentReconciliationCandidate) => {
        try {
            setBusyAction(`reconcile-${candidate.targetId}`);
            setActionError(null);
            const result = await reconcileAdminPayment(candidate.targetId);
            addToast("Payments", result.outcome === PAYMENT_RECONCILIATION_STATUS.MATCHED ? "Payment matched successfully." : `Payment check: ${result.outcome}.`);
            await loadCandidates();
        } catch (error) {
            setActionError(getAdminRequestError(error).message);
            addToast("Payments", "Payment reconciliation failed.");
        } finally {
            setBusyAction(null);
        }
    };

    const confirmCod = async (candidate: PaymentReconciliationCandidate) => {
        try {
            setBusyAction(`cod-${candidate.targetId}`);
            setActionError(null);
            await confirmAdminCodPayment(candidate.targetId, codNotes[candidate.targetId]);
            addToast("Payments", "COD payment marked as collected.");
            await loadCandidates();
        } catch (error) {
            setActionError(getAdminRequestError(error).message);
            addToast("Payments", "COD confirmation failed.");
        } finally {
            setBusyAction(null);
        }
    };

    const toggleWebhookEvents = async (candidate: PaymentReconciliationCandidate) => {
        if (expandedPaymentId === candidate.targetId) {
            setExpandedPaymentId(null);
            return;
        }

        if (webhookEvents[candidate.targetId]) {
            setExpandedPaymentId(candidate.targetId);
            return;
        }

        try {
            setBusyAction(`events-${candidate.targetId}`);
            setWebhookErrors((current) => ({ ...current, [candidate.targetId]: "" }));
            const events = await fetchPaymentWebhookEvents(candidate.targetId);
            setWebhookEvents((current) => ({ ...current, [candidate.targetId]: events }));
            setExpandedPaymentId(candidate.targetId);
        } catch (error) {
            setWebhookErrors((current) => ({
                ...current,
                [candidate.targetId]: getAdminRequestError(error).message,
            }));
        } finally {
            setBusyAction(null);
        }
    };

    const hasPreviousPage = currentPage > 1;
    const hasNextPage = paymentPage.pagination.totalPages > currentPage;

    return (
        <AdminLayout>
            <Helmet>
                <title>{tx("Payment reconciliation")} | Digital-E</title>
                <meta name="description" content={tx("Review and reconcile PayOS and COD payment ledger records.")} />
            </Helmet>
            <main className="admin__page admin__page--payments">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">{tx("Finance operations")}</span>
                        <h1 className="admin__page__title">{tx("Payment reconciliation")}</h1>
                        <p className="admin__page__subtitle">
                            {tx("Match PayOS settlements, confirm COD collection, and trace webhook evidence before fulfilment or support decisions.")}
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={() => void loadCandidates()} disabled={isLoading || busyAction !== null}>
                            {tx("Refresh queue")}
                        </button>
                        <button type="button" className="admin__button admin__button--primary" onClick={() => void runReconciliation()} disabled={busyAction !== null || isLoading}>
                            <ShieldIcon size={16} />
                            {busyAction === "run" ? tx("Running checks...") : tx("Run PayOS checks")}
                        </button>
                    </div>
                </header>

                {actionError ? <div className="admin__alert" role="alert">{actionError}</div> : null}

                <section className="admin__summary" aria-label={tx("Payment reconciliation summary")}>
                    <div className="admin__summary-card"><span>{tx("Queue total")}</span><strong>{counts.total}</strong><p>{tx("Records requiring review")}</p></div>
                    <div className="admin__summary-card"><span>{tx("PayOS in view")}</span><strong>{counts.payos}</strong><p>{tx("Provider lookups available")}</p></div>
                    <div className="admin__summary-card"><span>{tx("COD in view")}</span><strong>{counts.cash}</strong><p>{tx("Manual collection review")}</p></div>
                    <div className="admin__summary-card"><span>{tx("Needs attention")}</span><strong>{counts.attention}</strong><p>{tx("Mismatch or unavailable")}</p></div>
                </section>

                <section className="admin__card admin__payments__workspace">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>{tx("Reconciliation queue")}</h3>
                            <span aria-live="polite">{paymentPage.candidates.length} {tx("records in this view · VND only")}</span>
                        </div>
                        <div className="admin__payments__filters" aria-label={tx("Reconciliation filters")}>
                            <label>
                                <span>{tx("Provider")}</span>
                                <select aria-label={tx("Filter by provider")} value={provider} onChange={(event) => { setProvider(event.target.value as typeof provider); setCurrentPage(1); }}>
                                    <option value="">{tx("All providers")}</option>
                                    <option value={PAYMENT_METHOD.PAYOS}>PayOS</option>
                                    <option value={PAYMENT_METHOD.CASH}>{tx("Cash on delivery")}</option>
                                </select>
                            </label>
                            <label>
                                <span>{tx("Reconciliation status")}</span>
                                <select aria-label={tx("Filter by reconciliation status")} value={reconciliationStatus} onChange={(event) => { setReconciliationStatus(event.target.value as typeof reconciliationStatus); setCurrentPage(1); }}>
                                    {reconciliationStatuses.map((status) => <option key={status || "all"} value={status}>{tx(status || "All statuses")}</option>)}
                                </select>
                            </label>
                        </div>
                    </div>

                    {loadError && !hasLoaded ? (
                        <AdminStatusPanel variant="error" title={tx("Reconciliation unavailable")} description={loadError.message} onRetry={() => void loadCandidates()} />
                    ) : isLoading && !hasLoaded ? (
                        <AdminStatusPanel variant="loading" title={tx("Loading reconciliation queue")} description={tx("Fetching payment ledger candidates and their latest local state.")} />
                    ) : paymentPage.candidates.length === 0 ? (
                        <AdminStatusPanel variant="empty" title={tx("Reconciliation queue is clear")} description={tx("No payment records match the current filters.")} />
                    ) : (
                        <>
                            <div className="admin__table-wrap admin__payments__table-wrap" aria-busy={isLoading}>
                                <table className="admin__table admin__payments__table">
                                    <thead>
                                        <tr>
                                            <th scope="col">{tx("Target")}</th>
                                            <th scope="col">{tx("Provider")}</th>
                                            <th scope="col">{tx("Local state")}</th>
                                            <th scope="col">{tx("Expected")}</th>
                                            <th scope="col">{tx("Provider result")}</th>
                                            <th scope="col">{tx("Last event")}</th>
                                            <th scope="col">{tx("Mismatch reason")}</th>
                                            <th scope="col"><span className="admin__sr-only">{tx("Actions")}</span></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paymentPage.candidates.map((candidate) => {
                                            const isOrderPayment = candidate.targetType === PAYMENT_RECONCILIATION_TARGET_TYPE.ORDER_PAYMENT;
                                            const isCod = candidate.provider === PAYMENT_METHOD.CASH;
                                            const isCodConfirmed = candidate.reconciliationStatus === PAYMENT_RECONCILIATION_STATUS.MANUAL_CONFIRMED;
                                            const localPaymentStatus = candidate.localStatus.toLowerCase();
                                            const canConfirmCod = isCod && isOrderPayment && !isCodConfirmed
                                                && (localPaymentStatus === PAYMENT_STATUS.PENDING || localPaymentStatus === PAYMENT_STATUS.PAID);
                                            const canReconcile = candidate.provider === PAYMENT_METHOD.PAYOS && isOrderPayment;
                                            const rowBusy = busyAction === `reconcile-${candidate.targetId}` || busyAction === `cod-${candidate.targetId}`;
                                            return (
                                                <React.Fragment key={`${candidate.targetType}-${candidate.targetId}`}>
                                                    <tr>
                                                        <td>
                                                            <div className="admin__table__stack"><strong>{labelTarget(candidate, tx)}</strong><small>{tx(candidate.targetType.replaceAll("_", " "))} #{candidate.targetId}</small></div>
                                                        </td>
                                                        <td><span className="admin__payments__provider"><CashStackIcon size={15} />{labelProvider(candidate.provider)}</span><small>{candidate.providerReference || "No provider link"}</small></td>
                                                        <td><div className="admin__table__stack"><span className={`admin__pill admin__pill--${statusClass(candidate.localStatus)}`}>{tx(candidate.localStatus)}</span><small>{tx(candidate.reconciliationStatus)}</small></div></td>
                                                        <td><div className="admin__table__stack"><strong>{formatVnd(candidate.expectedAmount)}</strong><small>{tx(candidate.expectedCurrency || "Currency unknown")}</small></div></td>
                                                        <td><div className="admin__table__stack"><strong>{formatVnd(candidate.providerAmount)}</strong><small>{tx(candidate.providerStatus || "Not checked yet")}{candidate.providerCurrency ? ` · ${candidate.providerCurrency}` : ""}</small></div></td>
                                                        <td><div className="admin__table__stack"><span>{tx(candidate.lastEventStatus || "No event recorded")}</span><small>{formatDate(candidate.lastEventAt, locale)}</small></div></td>
                                                        <td><p>{candidate.mismatchReason || "—"}</p></td>
                                                        <td>
                                                            <div className="admin__table__actions admin__payments__actions">
                                                                {canReconcile ? <button type="button" className="admin__button admin__button--primary admin__button--compact" onClick={() => void reconcilePayment(candidate)} disabled={busyAction !== null}>{rowBusy ? tx("Checking...") : tx("Reconcile")}</button> : null}
                                                                {canConfirmCod ? (
                                                                    <>
                                                                        <label className="admin__payments__note"><span className="admin__sr-only">{tx("COD note for payment")} {candidate.targetId}</span><input aria-label={`${tx("COD note for payment")} ${candidate.targetId}`} value={codNotes[candidate.targetId] || ""} onChange={(event) => setCodNotes((current) => ({ ...current, [candidate.targetId]: event.target.value }))} placeholder={tx("Optional audit note")} maxLength={500} /></label>
                                                                        <button type="button" className="admin__button admin__button--success admin__button--compact" onClick={() => void confirmCod(candidate)} disabled={busyAction !== null}>{rowBusy ? tx("Confirming...") : tx("Confirm COD")}</button>
                                                                    </>
                                                                ) : isCodConfirmed ? <span className="admin__pill admin__pill--success"><CheckCircleIcon size={13} />{tx("Collected")}</span> : null}
                                                                {isOrderPayment ? <button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => void toggleWebhookEvents(candidate)} disabled={busyAction !== null}>{busyAction === `events-${candidate.targetId}` ? tx("Loading...") : expandedPaymentId === candidate.targetId ? tx("Hide events") : tx("Webhook events")}</button> : null}
                                                                {!canReconcile && !canConfirmCod && !isCodConfirmed && candidate.targetType === PAYMENT_RECONCILIATION_TARGET_TYPE.PENDING_CHECKOUT ? <small className="admin__payments__action-note">{tx("Run the queue check to process this reservation.")}</small> : null}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {expandedPaymentId === candidate.targetId ? (
                                                        <tr className="admin__payments__events-row">
                                                            <td colSpan={8}>
                                                                <div className="admin__payments__events" aria-label={`${tx("Webhook history for payment")} ${candidate.targetId}`}>
                                                                    <div><strong>{tx("Webhook history")}</strong><span>{webhookEvents[candidate.targetId]?.length || 0} {tx("events")}</span></div>
                                                                    {webhookErrors[candidate.targetId] ? <p className="admin__payments__event-error" role="alert">{webhookErrors[candidate.targetId]}</p> : null}
                                                                    {webhookEvents[candidate.targetId]?.length ? webhookEvents[candidate.targetId].map((event) => <WebhookEventRow key={event.id} event={event} tx={tx} locale={locale} />) : <span>{tx("No webhook events are linked to this payment.")}</span>}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : null}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {loadError && hasLoaded ? <AdminStatusPanel variant="error" title={tx("Refresh failed")} description={loadError.message} onRetry={() => void loadCandidates()} retryLabel={tx("Retry refresh")} /> : null}
                            <div className="admin__payments__pagination" aria-label={tx("Reconciliation pagination")}>
                                <span>{tx("Page")} {paymentPage.pagination.page} {tx("of")} {Math.max(paymentPage.pagination.totalPages, 1)}</span>
                                <div>
                                    <button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => setCurrentPage((value) => Math.max(1, value - 1))} disabled={!hasPreviousPage || isLoading}>{tx("Previous")}</button>
                                    <button type="button" className="admin__button admin__button--ghost admin__button--compact" onClick={() => setCurrentPage((value) => value + 1)} disabled={!hasNextPage || isLoading}>{tx("Next")}</button>
                                </div>
                            </div>
                        </>
                    )}
                </section>
                <PaymentAttemptExceptions />
            </main>
        </AdminLayout>
    );
};

const WebhookEventRow = ({ event, tx, locale }: { event: PaymentWebhookEvent; tx: (source: string) => string; locale: string }) => (
    <article className="admin__payments__event">
        <div><strong>{tx(event.eventType)}</strong><span className={`admin__pill admin__pill--${statusClass(event.status)}`}>{tx(event.status)}</span></div>
        <p>{event.lastError || tx("No processing error recorded.")}</p>
        <small>{formatDate(event.receivedAt, locale)} · {tx("Attempt")} {event.attemptCount}</small>
    </article>
);

export default AdminPaymentReconciliationPage;
