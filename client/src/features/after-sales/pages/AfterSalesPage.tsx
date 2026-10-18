import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../../components/layout/Layout";
import CustomerAccountShell from "../../users/components/CustomerAccountShell";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { formatUtcDateTime } from "../../../utils/dateTime";
import { fetchCustomerOrderDetail, fetchCustomerOrders } from "../../orders/api";
import type { CustomerOrder, CustomerOrderDetail } from "../../orders/types";
import { createCustomerAfterSalesRequest, fetchCustomerAfterSalesRequests } from "../api";
import { AFTER_SALES_PAGINATION, AFTER_SALES_REQUEST_REASON_MAX_LENGTH, AFTER_SALES_STATUS_TRANSLATION_KEYS } from "../constants";
import { AFTER_SALES_KIND, type AfterSalesKind, type AfterSalesRequest } from "../types";
import { getStableIdempotencyKey, type StableIdempotencyKey } from "../idempotency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import "../../../styles/features/after-sales/_after-sales.scss";

const errorMessage = (error: unknown, fallback: string) => {
    return getApiErrorMessage(error, fallback);
};

const AfterSalesPage = () => {
    const { userData } = useAuth();
    const { addToast } = useToast();
    const t = useT();
    const { locale } = useLocale();
    const [searchParams] = useSearchParams();
    const [orders, setOrders] = useState<CustomerOrder[]>([]);
    const [requests, setRequests] = useState<AfterSalesRequest[]>([]);
    const [orderDetail, setOrderDetail] = useState<CustomerOrderDetail | null>(null);
    const [orderId, setOrderId] = useState(searchParams.get("order") || "");
    const [kind, setKind] = useState<AfterSalesKind>(AFTER_SALES_KIND.RETURN);
    const [reason, setReason] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingOrder, setIsLoadingOrder] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const idempotencyKeyRef = useRef<StableIdempotencyKey | null>(null);

    const loadRequests = useCallback(async () => {
        try {
            setIsLoading(true);
            setHistoryError(null);
            setError(null);
            const [orderPage, orderRows] = await Promise.all([
                fetchCustomerAfterSalesRequests({ page: AFTER_SALES_PAGINATION.FIRST_PAGE, limit: AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE }),
                userData?.id ? fetchCustomerOrders(userData.id) : Promise.resolve([]),
            ]);
            setRequests(orderPage.requests);
            setOrders(orderRows);
        } catch (loadError) {
            const message = errorMessage(loadError, t("afterSales.loadError"));
            setHistoryError(message);
        } finally {
            setIsLoading(false);
        }
    }, [t, userData?.id]);

    useEffect(() => { void loadRequests(); }, [loadRequests]);

    const loadOrder = async () => {
        const parsed = Number(orderId);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            setError(t("afterSales.invalidOrderId"));
            return;
        }
        try {
            setError(null);
            setIsLoadingOrder(true);
            const detail = await fetchCustomerOrderDetail(parsed);
            if (!detail) throw new Error(t("afterSales.orderNotFound"));
            setOrderDetail(detail);
            setQuantities({});
        } catch (loadError) {
            setOrderDetail(null);
            setError(errorMessage(loadError, t("afterSales.orderLoadError")));
        } finally {
            setIsLoadingOrder(false);
        }
    };

    const selectedItems = useMemo(
        () => Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([itemId, quantity]) => ({ orderItemId: Number(itemId), quantity })),
        [quantities],
    );

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!orderDetail || selectedItems.length === 0 || !reason.trim()) {
            setError(t("afterSales.submitValidationError"));
            return;
        }
        try {
            setIsSubmitting(true);
            setError(null);
            setSuccess(null);
            const payload = { orderId: orderDetail.id, kind, reason: reason.trim(), items: selectedItems };
            const idempotencyRequest = getStableIdempotencyKey(payload, idempotencyKeyRef.current);
            idempotencyKeyRef.current = idempotencyRequest;
            await createCustomerAfterSalesRequest({ ...payload, idempotencyKey: idempotencyRequest.key });
            idempotencyKeyRef.current = null;
            setSuccess(t("afterSales.submitted"));
            setReason("");
            setQuantities({});
            addToast(t("afterSales.toastTitle"), t("afterSales.submitted"));
            await loadRequests();
        } catch (submitError) {
            setError(errorMessage(submitError, t("afterSales.submitError")));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <Helmet><title>{t("afterSales.metaTitle")}</title><meta name="description" content={t("afterSales.metaDescription")} /></Helmet>
            <main className="after-sales app-page">
                <CustomerAccountShell eyebrow={t("afterSales.eyebrow")} title={t("afterSales.title")} description={t("afterSales.description")} />
                {error ? <div className="after-sales__alert" role="alert">{error}</div> : null}
                {success ? <div className="after-sales__success" role="status">{success}</div> : null}
                <section className="after-sales__layout">
                    <form className="after-sales__card" onSubmit={submit}>
                        <div className="after-sales__card-header"><div><span className="after-sales__eyebrow">{t("afterSales.newRequestEyebrow")}</span><h2>{t("afterSales.newRequestTitle")}</h2></div></div>
                        <label>{t("afterSales.orderId")}<input value={orderId} onChange={(event) => setOrderId(event.target.value)} inputMode="numeric" placeholder={t("afterSales.orderIdPlaceholder")} /></label>
                        <button type="button" className="after-sales__secondary" onClick={() => void loadOrder()} disabled={isLoadingOrder}>{isLoadingOrder ? t("afterSales.loadingItems") : t("afterSales.loadOrder")}</button>
                        <label>{t("afterSales.requestType")}<select value={kind} onChange={(event) => setKind(event.target.value as AfterSalesKind)}><option value={AFTER_SALES_KIND.RETURN}>{t("afterSales.return")}</option><option value={AFTER_SALES_KIND.WARRANTY}>{t("afterSales.warranty")}</option></select></label>
                        {kind === AFTER_SALES_KIND.RETURN && orderDetail?.return_eligible_until ? <p role="note">{t(Date.parse(orderDetail.return_eligible_until) < Date.now() ? "afterSales.returnWindowEnded" : "afterSales.returnDeadline", formatUtcDateTime(orderDetail.return_eligible_until, locale === "vi" ? "vi-VN" : "en-GB"))}</p> : null}
                        {orderDetail ? <div className="after-sales__items"><span className="after-sales__label">{t("afterSales.items")}</span>{orderDetail.items.map((item) => { const itemId = Number(item.orderItemId || (item as typeof item & { id?: number }).id || 0); return <label className="after-sales__item" key={itemId}><span><strong>{item.productName}</strong><small>{t("afterSales.orderedQuantity", item.quantity)}</small></span><input aria-label={t("afterSales.quantityLabel", item.productName)} type="number" min="0" max={item.quantity} value={quantities[itemId] || 0} onChange={(event) => setQuantities((current) => ({ ...current, [itemId]: Number(event.target.value) || 0 }))} /></label>; })}</div> : <p className="after-sales__hint">{t("afterSales.loadOrderHint")}</p>}
                        <label>{t("afterSales.issueLabel")}<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} maxLength={AFTER_SALES_REQUEST_REASON_MAX_LENGTH} placeholder={t("afterSales.issuePlaceholder")} /></label>
                        <button type="submit" className="after-sales__primary" disabled={isSubmitting || !orderDetail}>{isSubmitting ? t("afterSales.submitting") : t("afterSales.submit")}</button>
                    </form>
                    <aside className="after-sales__card after-sales__card--guide"><span className="after-sales__eyebrow">{t("afterSales.guideEyebrow")}</span><h2>{t("afterSales.guideTitle")}</h2><ol><li>{t("afterSales.guideStepOne")}</li><li>{t("afterSales.guideStepTwo")}</li><li>{t("afterSales.guideStepThree")}</li></ol><Link to="/support">{t("afterSales.supportLink")}</Link></aside>
                </section>
                <section className="after-sales__card" aria-busy={isLoading}>
                    <div className="after-sales__card-header">
                        <div><span className="after-sales__eyebrow">{t("afterSales.historyEyebrow")}</span><h2>{t("afterSales.historyTitle")}</h2></div>
                        <span>{isLoading ? t("afterSales.loadingRequests") : t("afterSales.requestCount", requests.length)}</span>
                    </div>
                    {isLoading ? <p className="after-sales__hint" role="status">{t("afterSales.loadingRequests")}</p> : null}
                    {historyError ? (
                        <div className="after-sales__history-error" role="alert">
                            <p>{historyError}</p>
                            <button type="button" className="after-sales__secondary" onClick={() => void loadRequests()}>
                                {t("afterSales.refreshRequests")}
                            </button>
                        </div>
                    ) : null}
                    {!isLoading && !historyError && requests.length === 0 ? <p className="after-sales__hint">{t("afterSales.noRequests")}</p> : null}
                    {!isLoading && requests.length > 0 ? <div className="after-sales__request-list">{requests.map((request) => <article className="after-sales__request" key={request.id}><div><strong>#{request.id} · {request.kind === AFTER_SALES_KIND.RETURN ? t("afterSales.returnKind") : t("afterSales.warranty")}</strong><p>{request.reason}</p></div><span className={`after-sales__status after-sales__status--${request.status.toLowerCase()}`}>{t(`afterSales.status.${AFTER_SALES_STATUS_TRANSLATION_KEYS[request.status]}`)}</span><small>{t("afterSales.orderId")} #{request.orderId}</small></article>)}</div> : null}
                </section>
                {orders.length > 0 ? <p className="after-sales__footnote">{t("afterSales.ordersCount", orders.length)} <Link to="/orders">{t("afterSales.orderHistory")}</Link></p> : null}
            </main>
        </Layout>
    );
};

export default AfterSalesPage;
