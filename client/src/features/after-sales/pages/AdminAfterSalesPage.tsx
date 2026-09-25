import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../../admin/components/AdminStatusPanel";
import { getAdminRequestError, type AdminRequestError } from "../../admin/utils/adminRequestError";
import { useToast } from "../../../context/ToastContext";
import { confirmAdminAfterSalesRefund, fetchAdminAfterSalesRequest, fetchAdminAfterSalesRequests, transitionAdminAfterSalesRequest } from "../api";
import { AFTER_SALES_PAGINATION } from "../constants";
import { AFTER_SALES_STATUS, AFTER_SALES_STATUSES, type AfterSalesRequest, type AfterSalesStatus } from "../types";
import { CURRENCY_CODE } from "../../../constants/currency";
import "../../../styles/features/after-sales/_after-sales-admin.scss";

const statuses = AFTER_SALES_STATUSES;
const label = (value: string) => value.replaceAll("_", " ");

const AdminAfterSalesPage = () => {
    const { addToast } = useToast();
    const [requests, setRequests] = useState<AfterSalesRequest[]>([]);
    const [selected, setSelected] = useState<AfterSalesRequest | null>(null);
    const [statusFilter, setStatusFilter] = useState("");
    const [refundReference, setRefundReference] = useState("");
    const [refundCurrency, setRefundCurrency] = useState<string>(CURRENCY_CODE.VND);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<AdminRequestError | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);
    const selectedRef = useRef(selected);

    useEffect(() => {
        selectedRef.current = selected;
    }, [selected]);

    const load = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const page = await fetchAdminAfterSalesRequests({ page: AFTER_SALES_PAGINATION.FIRST_PAGE, limit: AFTER_SALES_PAGINATION.MAX_PAGE_SIZE, ...(statusFilter ? { status: statusFilter as AfterSalesStatus } : {}) });
            setRequests(page.requests);
            const currentSelection = selectedRef.current;
            if (currentSelection) setSelected(await fetchAdminAfterSalesRequest(currentSelection.id));
        } catch (loadError) {
            setError(getAdminRequestError(loadError));
        } finally {
            setIsLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { void load(); }, [load]);

    const selectRequest = async (request: AfterSalesRequest) => {
        try { setSelected(await fetchAdminAfterSalesRequest(request.id)); } catch (loadError) { setError(getAdminRequestError(loadError)); }
    };

    const transition = async (status: AfterSalesStatus) => {
        if (!selected) return;
        try {
            setBusyId(selected.id);
            const updated = await transitionAdminAfterSalesRequest(selected.id, status);
            setSelected(updated);
            setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
            addToast("After-sales", `Request #${updated.id} moved to ${label(updated.status).toLowerCase()}.`);
        } catch (transitionError) { addToast("After-sales", getAdminRequestError(transitionError).message); } finally { setBusyId(null); }
    };

    const refund = async () => {
        if (!selected || !refundReference.trim()) return;
        try {
            setBusyId(selected.id);
            const updated = await confirmAdminAfterSalesRefund(selected.id, { refundReference: refundReference.trim(), currency: refundCurrency, idempotencyKey: `admin-refund-${selected.id}-${refundReference.trim()}` });
            setSelected(updated);
            setRequests((current) => current.map((item) => item.id === updated.id ? updated : item));
            addToast("After-sales", `Refund for request #${updated.id} confirmed.`);
        } catch (refundError) { addToast("Refund", getAdminRequestError(refundError).message); } finally { setBusyId(null); }
    };

    return <AdminLayout><Helmet><title>After-sales queue | Digital-E</title><meta name="description" content="Review returns, warranties, and refunds." /></Helmet><main className="admin__page admin__page--after-sales"><header className="admin__page__header"><div><span className="admin__page__eyebrow">Customer care</span><h1 className="admin__page__title">After-sales queue</h1><p className="admin__page__subtitle">Review eligibility, keep the request timeline accurate, and confirm refunds from the payment ledger.</p></div><div className="admin__page__actions"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter after-sales requests"><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select><button type="button" className="admin__button admin__button--ghost" onClick={() => void load()}>Refresh</button></div></header>{error && !requests.length ? <AdminStatusPanel variant="error" title={error.title} description={error.message} onRetry={() => void load()} /> : null}{isLoading && !requests.length ? <AdminStatusPanel variant="loading" title="Loading after-sales queue" description="Fetching the latest requests." /> : null}<section className="after-sales-admin__layout"><div className="admin__card after-sales-admin__queue"><div className="admin__card__header"><div><h3>Requests</h3><span>{requests.length} visible</span></div></div>{!isLoading && !requests.length ? <AdminStatusPanel variant="empty" title="No requests found" description="Try another status filter." /> : <div className="after-sales-admin__list">{requests.map((request) => <button type="button" key={request.id} className={`after-sales-admin__row${selected?.id === request.id ? " is-active" : ""}`} onClick={() => void selectRequest(request)}><span><strong>#{request.id} · Order #{request.orderId}</strong><small>{request.kind} · {request.reason}</small></span><em>{label(request.status)}</em></button>)}</div>}</div><div className="admin__card after-sales-admin__detail">{selected ? <><div className="admin__card__header"><div><span className="admin__page__eyebrow">Request #{selected.id}</span><h3>{selected.kind} · Order #{selected.orderId}</h3></div><span className="after-sales-admin__status">{label(selected.status)}</span></div><p>{selected.reason}</p><div className="after-sales-admin__items">{(selected.items || []).map((item) => <div key={item.id}><span>{item.productName || `Order item #${item.orderItemId}`}</span><strong>x{item.quantity}</strong></div>)}</div><div className="after-sales-admin__actions">{selected.status === AFTER_SALES_STATUS.REQUESTED ? <><button className="admin__button" type="button" disabled={busyId === selected.id} onClick={() => void transition(AFTER_SALES_STATUS.APPROVED)}>Approve</button><button className="admin__button admin__button--danger" type="button" disabled={busyId === selected.id} onClick={() => void transition(AFTER_SALES_STATUS.REJECTED)}>Reject</button></> : null}{selected.status === AFTER_SALES_STATUS.APPROVED ? <button className="admin__button" type="button" disabled={busyId === selected.id} onClick={() => void transition(AFTER_SALES_STATUS.RECEIVED)}>Mark received</button> : null}{selected.status === AFTER_SALES_STATUS.RECEIVED ? <button className="admin__button" type="button" disabled={busyId === selected.id} onClick={() => void transition(AFTER_SALES_STATUS.REFUND_PENDING)}>Queue refund</button> : null}</div>{(selected.status === AFTER_SALES_STATUS.RECEIVED || selected.status === AFTER_SALES_STATUS.REFUND_PENDING) ? <div className="after-sales-admin__refund"><h4>Confirm refund</h4><div><input value={refundReference} onChange={(event) => setRefundReference(event.target.value)} placeholder="Provider or manual reference" aria-label="Refund reference" /><select value={refundCurrency} onChange={(event) => setRefundCurrency(event.target.value)} aria-label="Refund currency"><option value={CURRENCY_CODE.VND}>VND</option><option value={CURRENCY_CODE.USD}>USD</option></select><button type="button" className="admin__button" disabled={busyId === selected.id || !refundReference.trim()} onClick={() => void refund()}>Confirm refund</button></div></div> : null}<div className="after-sales-admin__timeline"><h4>Timeline</h4>{(selected.events || []).map((event) => <div key={event.id}><strong>{label(event.toStatus)}</strong><span>{event.note || "Status updated"}</span></div>)}</div></> : <AdminStatusPanel variant="empty" title="Select a request" description="Choose a request to review its items and timeline." />}</div></section></main></AdminLayout>;
};

export default AdminAfterSalesPage;
