import { useCallback, useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import { useT } from "../../../hooks/useT";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminStatusPanel from "../../admin/components/AdminStatusPanel";
import { confirmReturnedShipment, createFulfillmentShipment, fetchFulfillmentLabel, fetchFulfillmentOrder, fetchFulfillmentOrders, transitionFulfillment } from "../api";
import type { FulfillmentOrder, ShipmentSummary } from "../types";
import InternalDeliveryAssignmentsPanel from "../components/InternalDeliveryAssignmentsPanel";
import "../../../styles/features/shipping/_shipping.scss";

const NEXT: Record<string, Array<"CONFIRMED" | "PICKING" | "PACKED" | "READY_TO_SHIP">> = {
    UNFULFILLED: ["CONFIRMED"], CONFIRMED: ["PICKING"], PICKING: ["PACKED"], PACKED: ["READY_TO_SHIP"],
};

export default function AdminFulfillmentPage() {
    const t = useT();
    const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ShipmentSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [label, setLabel] = useState<{ token: string; expiresAt: string } | null>(null);
    const [returnConfirmed, setReturnConfirmed] = useState(false);
    const idempotencyKeys = useMemo(() => new Map<number, string>(), []);

    const loadOrders = useCallback(async () => {
        setError("");
        try {
            const result = await fetchFulfillmentOrders();
            setOrders(result);
            setSelectedId((current) => current && result.some((row) => row.orderId === current) ? current : result[0]?.orderId ?? null);
        } catch {
            setError(t("shipping.adminLoadError"));
        } finally { setLoading(false); }
    }, [t]);

    const loadDetail = useCallback(async (orderId: number) => {
        try { setDetail(await fetchFulfillmentOrder(orderId)); }
        catch { setDetail(null); setError(t("shipping.adminDetailError")); }
    }, [t]);

    useEffect(() => { void loadOrders(); }, [loadOrders]);
    useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [loadDetail, selectedId]);

    const act = async (action: () => Promise<unknown>, success: string) => {
        if (busy) return;
        setBusy(true); setError(""); setNotice("");
        try { await action(); setNotice(success); if (selectedId) await loadDetail(selectedId); await loadOrders(); }
        catch { setError(t("shipping.adminActionError")); }
        finally { setBusy(false); }
    };

    const createShipment = () => {
        if (!selectedId) return;
        let key = idempotencyKeys.get(selectedId);
        if (!key) { key = crypto.randomUUID(); idempotencyKeys.set(selectedId, key); }
        void act(() => createFulfillmentShipment(selectedId, key!), t("shipping.createRequested"));
    };

    const getLabel = async () => {
        if (!selectedId) return;
        setBusy(true); setError(""); setNotice("");
        try { setLabel(await fetchFulfillmentLabel(selectedId)); }
        catch { setLabel(null); setError(t("shipping.labelError")); }
        finally { setBusy(false); }
    };

    const state = detail?.state || orders.find((row) => row.orderId === selectedId)?.state || "";
    const nextStates = NEXT[state] || [];
    const stateLabel = (value: string) => {
        const key = `shipping.state.${value}`;
        const translated = t(key);
        return translated === key ? value.replaceAll("_", " ") : translated;
    };

    return <AdminLayout>
        <Helmet><title>{t("shipping.adminTitle")}</title></Helmet>
        <main className="admin__page shipping-admin">
            <InternalDeliveryAssignmentsPanel />
            <header className="admin__page__header"><div><span className="admin__page__eyebrow">{t("shipping.fulfillment")}</span><h1 className="admin__page__title">{t("shipping.adminTitle")}</h1><p className="admin__page__subtitle">{t("shipping.adminDescription")}</p></div><button type="button" className="admin__button admin__button--ghost" onClick={() => void loadOrders()} disabled={busy}>{t("shipping.refresh")}</button></header>
            {notice ? <p className="shipping-admin__notice" role="status">{notice}</p> : null}
            {error ? <AdminStatusPanel variant="error" title={t("shipping.adminErrorTitle")} description={error} onRetry={() => void loadOrders()} /> : null}
            {loading ? <AdminStatusPanel variant="loading" title={t("shipping.loadingFulfillment")} description={t("shipping.loadingFulfillmentDescription")} /> : null}
            {!loading && !error && orders.length === 0 ? <AdminStatusPanel variant="empty" title={t("shipping.noFulfillmentOrders")} description={t("shipping.noFulfillmentOrdersDescription")} /> : null}
            {!loading && orders.length > 0 ? <div className="shipping-admin__layout">
                <section className="shipping-admin__list" aria-label={t("shipping.fulfillmentOrders")}>
                    {orders.map((row) => <button type="button" key={row.orderId} className={row.orderId === selectedId ? "is-active" : ""} onClick={() => { setSelectedId(row.orderId); setLabel(null); setReturnConfirmed(false); }} aria-current={row.orderId === selectedId ? "true" : undefined}>
                        <strong>#{row.orderId}</strong><span>{stateLabel(row.state)}</span><small>{row.trackingCode || t("shipping.noTracking")}</small>{row.sandbox ? <em>{t("shipping.sandbox")}</em> : null}
                    </button>)}
                </section>
                {detail ? <section className="shipping-admin__detail" aria-live="polite">
                    <h2>{t("shipping.orderLabel").replace("{id}", String(detail.orderId))}</h2>
                    <p>{t("shipping.currentState")}: <strong>{stateLabel(detail.state)}</strong></p>
                    {detail.trackingCode ? <p>{t("shipping.trackingCode")}: <strong>{detail.trackingCode}</strong></p> : null}
                    {detail.sandbox ? <p className="shipping-admin__sandbox">{t("shipping.sandboxShipment")}</p> : null}
                    {detail.expectedDeliveryAt ? <p>{t("shipping.expectedDelivery")}: {formatUtcDateTime(detail.expectedDeliveryAt)}</p> : null}
                    <div className="shipping-admin__actions">
                        {nextStates.map((next) => <button key={next} type="button" disabled={busy} onClick={() => void act(() => transitionFulfillment(detail.orderId, next), t("shipping.transitionSaved"))}>{t(`shipping.state.${next}`)}</button>)}
                        {state === "READY_TO_SHIP" && !detail.trackingCode ? <button type="button" disabled={busy} onClick={createShipment}>{busy ? t("shipping.actionPending") : t("shipping.createShipment")}</button> : null}
                        {detail.trackingCode ? <button type="button" disabled={busy} onClick={() => void getLabel()}>{t("shipping.requestLabel")}</button> : null}
                        {state === "RETURNED" ? <button type="button" disabled={busy || !returnConfirmed} onClick={() => void act(() => confirmReturnedShipment(detail.orderId), t("shipping.returnReceived"))}>{t("shipping.confirmReturnReceived")}</button> : null}
                    </div>
                    {state === "RETURNED" ? <label className="shipping-admin__confirm"><input type="checkbox" checked={returnConfirmed} onChange={(event) => setReturnConfirmed(event.target.checked)} />{t("shipping.returnReceiptConfirm")}</label> : null}
                    {label ? <div className="shipping-admin__label" role="status"><strong>{t("shipping.labelReady")}</strong><input aria-label={t("shipping.labelToken")} readOnly type="password" value={label.token} /><small>{t("shipping.labelExpires").replace("{time}", formatUtcDateTime(label.expiresAt))}</small></div> : null}
                </section> : null}
            </div> : null}
        </main>
    </AdminLayout>;
}
