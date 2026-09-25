import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import Layout from "../../../components/layout/Layout";
import CustomerAccountShell from "../../users/components/CustomerAccountShell";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { fetchCustomerOrderDetail, fetchCustomerOrders } from "../../orders/api";
import type { CustomerOrder, CustomerOrderDetail } from "../../orders/types";
import { createCustomerAfterSalesRequest, fetchCustomerAfterSalesRequests } from "../api";
import { AFTER_SALES_PAGINATION, AFTER_SALES_REQUEST_REASON_MAX_LENGTH } from "../constants";
import { AFTER_SALES_KIND, type AfterSalesKind, type AfterSalesRequest } from "../types";
import { getApiErrorMessage } from "../../../lib/api-contract";
import "../../../styles/features/after-sales/_after-sales.scss";

const errorMessage = (error: unknown, fallback: string) => {
    return getApiErrorMessage(error, fallback);
};

const idempotencyKey = () => globalThis.crypto?.randomUUID?.() || `after-sales-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const statusLabel = (status: string) => status.replaceAll("_", " ");

const AfterSalesPage = () => {
    const { userData } = useAuth();
    const { addToast } = useToast();
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

    const loadRequests = useCallback(async () => {
        try {
            setIsLoading(true);
            const [orderPage, orderRows] = await Promise.all([
                fetchCustomerAfterSalesRequests({ page: AFTER_SALES_PAGINATION.FIRST_PAGE, limit: AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE }),
                userData?.id ? fetchCustomerOrders(userData.id) : Promise.resolve([]),
            ]);
            setRequests(orderPage.requests);
            setOrders(orderRows);
        } catch (loadError) {
            setError(errorMessage(loadError, "Unable to load after-sales requests."));
        } finally {
            setIsLoading(false);
        }
    }, [userData?.id]);

    useEffect(() => { void loadRequests(); }, [loadRequests]);

    const loadOrder = async () => {
        const parsed = Number(orderId);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
            setError("Enter a valid order ID before loading items.");
            return;
        }
        try {
            setError(null);
            setIsLoadingOrder(true);
            const detail = await fetchCustomerOrderDetail(parsed);
            if (!detail) throw new Error("Order not found.");
            setOrderDetail(detail);
            setQuantities({});
        } catch (loadError) {
            setOrderDetail(null);
            setError(errorMessage(loadError, "Unable to load that order."));
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
            setError("Choose at least one item and explain the issue before submitting.");
            return;
        }
        try {
            setIsSubmitting(true);
            setError(null);
            await createCustomerAfterSalesRequest({ orderId: orderDetail.id, kind, reason: reason.trim(), items: selectedItems, idempotencyKey: idempotencyKey() });
            setReason("");
            setQuantities({});
            addToast("After-sales", "Your request has been submitted for review.");
            await loadRequests();
        } catch (submitError) {
            setError(errorMessage(submitError, "Unable to submit this request."));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Layout>
            <Helmet><title>After-sales | Digital-E</title><meta name="description" content="Request a return or warranty review for an eligible Digital-E order." /></Helmet>
            <main className="after-sales app-page">
                <CustomerAccountShell eyebrow="CUSTOMER CARE" title="After-sales" description="Request a return or warranty review for delivered orders. We will keep every status change in your request timeline." />
                {error ? <div className="after-sales__alert" role="alert">{error}</div> : null}
                <section className="after-sales__layout">
                    <form className="after-sales__card" onSubmit={submit}>
                        <div className="after-sales__card-header"><div><span className="after-sales__eyebrow">NEW REQUEST</span><h2>Start a return or warranty review</h2></div></div>
                        <label>Order ID<input value={orderId} onChange={(event) => setOrderId(event.target.value)} inputMode="numeric" placeholder="e.g. 1042" /></label>
                        <button type="button" className="after-sales__secondary" onClick={() => void loadOrder()} disabled={isLoadingOrder}>{isLoadingOrder ? "Loading items…" : "Load order items"}</button>
                        <label>Request type<select value={kind} onChange={(event) => setKind(event.target.value as AfterSalesKind)}><option value={AFTER_SALES_KIND.RETURN}>Return within the return window</option><option value={AFTER_SALES_KIND.WARRANTY}>Warranty review</option></select></label>
                        {orderDetail ? <div className="after-sales__items"><span className="after-sales__label">Items</span>{orderDetail.items.map((item) => { const itemId = Number(item.orderItemId || (item as typeof item & { id?: number }).id || 0); return <label className="after-sales__item" key={itemId}><span><strong>{item.productName}</strong><small>Ordered quantity: {item.quantity}</small></span><input aria-label={`Quantity for ${item.productName}`} type="number" min="0" max={item.quantity} value={quantities[itemId] || 0} onChange={(event) => setQuantities((current) => ({ ...current, [itemId]: Number(event.target.value) || 0 }))} /></label>; })}</div> : <p className="after-sales__hint">Load an order to select the affected items.</p>}
                        <label>What happened?<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} maxLength={AFTER_SALES_REQUEST_REASON_MAX_LENGTH} placeholder="Tell us what went wrong and what outcome you expect." /></label>
                        <button type="submit" className="after-sales__primary" disabled={isSubmitting || !orderDetail}>{isSubmitting ? "Submitting…" : "Submit request"}</button>
                    </form>
                    <aside className="after-sales__card after-sales__card--guide"><span className="after-sales__eyebrow">HOW IT WORKS</span><h2>Clear next steps</h2><ol><li>Choose a delivered order and the affected quantities.</li><li>We review eligibility and update the request timeline.</li><li>Refunds are confirmed by the admin team after review.</li></ol><Link to="/support">Need help first? Contact support →</Link></aside>
                </section>
                <section className="after-sales__card"><div className="after-sales__card-header"><div><span className="after-sales__eyebrow">REQUEST HISTORY</span><h2>Your requests</h2></div><span>{isLoading ? "Loading…" : `${requests.length} request${requests.length === 1 ? "" : "s"}`}</span></div>{requests.length === 0 && !isLoading ? <p className="after-sales__hint">No after-sales requests yet.</p> : <div className="after-sales__request-list">{requests.map((request) => <article className="after-sales__request" key={request.id}><div><strong>#{request.id} · {request.kind}</strong><p>{request.reason}</p></div><span className={`after-sales__status after-sales__status--${request.status.toLowerCase()}`}>{statusLabel(request.status)}</span><small>Order #{request.orderId}</small></article>)}</div>}</section>
                {orders.length > 0 ? <p className="after-sales__footnote">You have {orders.length} order{orders.length === 1 ? "" : "s"}. <Link to="/orders">Review order history →</Link></p> : null}
            </main>
        </Layout>
    );
};

export default AfterSalesPage;
