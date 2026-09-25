import { useState, type FormEvent } from "react";
import { createGuestAfterSalesRequest, fetchGuestAfterSalesRequests } from "../api";
import { AFTER_SALES_PAGINATION, AFTER_SALES_REQUEST_REASON_MAX_LENGTH } from "../constants";
import { AFTER_SALES_KIND, type AfterSalesKind, type AfterSalesRequest } from "../types";
import type { GuestOrderItem } from "../../orders/types";
import { formatMoney } from "../../../utils/currency";
import { CURRENCY_CODE } from "../../../constants/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";

type Props = { orderId: number; guestOrderToken: string; currency?: string | null; items: GuestOrderItem[] };

const errorMessage = (error: unknown) => getApiErrorMessage(error, "Unable to process this request.");

const GuestAfterSalesPanel = ({ orderId, guestOrderToken, currency, items }: Props) => {
    const [kind, setKind] = useState<AfterSalesKind>(AFTER_SALES_KIND.RETURN);
    const [reason, setReason] = useState("");
    const [quantities, setQuantities] = useState<Record<number, number>>({});
    const [requests, setRequests] = useState<AfterSalesRequest[]>([]);
    const [expanded, setExpanded] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = async () => {
        try { setMessage(null); setExpanded(true); const page = await fetchGuestAfterSalesRequests(orderId, guestOrderToken, { page: AFTER_SALES_PAGINATION.FIRST_PAGE, limit: AFTER_SALES_PAGINATION.DEFAULT_PAGE_SIZE }); setRequests(page.requests); } catch (error) { setMessage(errorMessage(error)); }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const selectedItems = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([orderItemId, quantity]) => ({ orderItemId: Number(orderItemId), quantity }));
        if (!selectedItems.length || !reason.trim()) { setMessage("Select an item and explain the issue first."); return; }
        try { setBusy(true); setMessage(null); await createGuestAfterSalesRequest({ orderId, guestOrderToken, kind, reason: reason.trim(), items: selectedItems, idempotencyKey: `guest-after-sales-${orderId}-${Date.now()}` }); setReason(""); setQuantities({}); await load(); } catch (error) { setMessage(errorMessage(error)); } finally { setBusy(false); }
    };

    return <section className="guest-order__after-sales" aria-label="After-sales request"><div className="guest-order__after-sales-header"><div><span className="guest-order__eyebrow">CUSTOMER CARE</span><h3>Need a return or warranty review?</h3><p>Your access token stays in this browser request and is never added to the URL.</p></div><button type="button" onClick={() => void load()}>{expanded ? "Refresh requests" : "View after-sales"}</button></div>{expanded ? <><form onSubmit={submit}><label>Request type<select value={kind} onChange={(event) => setKind(event.target.value as AfterSalesKind)}><option value={AFTER_SALES_KIND.RETURN}>Return</option><option value={AFTER_SALES_KIND.WARRANTY}>Warranty</option></select></label><div className="guest-order__after-sales-items">{items.map((item) => { const itemId = Number(item.orderItemId || 0); return <label key={itemId}><span><strong>{item.productName}</strong><small>{formatMoney(item.totalPrice, currency === CURRENCY_CODE.USD ? CURRENCY_CODE.USD : CURRENCY_CODE.VND)} · max {item.quantity}</small></span><input aria-label={`After-sales quantity for ${item.productName}`} type="number" min="0" max={item.quantity} value={quantities[itemId] || 0} onChange={(event) => setQuantities((current) => ({ ...current, [itemId]: Number(event.target.value) || 0 }))} /></label>; })}</div><label>What happened?<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={AFTER_SALES_REQUEST_REASON_MAX_LENGTH} placeholder="Describe the problem" /></label><button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button></form><div className="guest-order__after-sales-list">{requests.length ? requests.map((request) => <article key={request.id}><strong>#{request.id} · {request.kind}</strong><span>{request.status.replaceAll("_", " ")}</span><p>{request.reason}</p></article>) : <p>No after-sales requests for this order.</p>}</div></> : null}{message ? <div className="guest-order__error" role="alert">{message}</div> : null}</section>;
};

export default GuestAfterSalesPanel;
