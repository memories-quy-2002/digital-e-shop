import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminStatusPanel from "../../admin/components/AdminStatusPanel";
import { fetchFulfillmentOrder, fetchFulfillmentOrders, transitionFulfillment } from "../api";
import type { FulfillmentOrder, ShipmentSummary } from "../types";
import InternalDeliveryAssignmentsPanel from "../components/InternalDeliveryAssignmentsPanel";
import "../../../styles/features/shipping/_shipping.scss";

const NEXT: Record<string, Array<"CONFIRMED" | "PICKING" | "PACKED" | "READY_TO_SHIP">> = {
    UNFULFILLED: ["CONFIRMED"], CONFIRMED: ["PICKING"], PICKING: ["PACKED"], PACKED: ["READY_TO_SHIP"],
};

export default function AdminFulfillmentPage() {
    const t = useT();
    const { locale } = useLocale();
    const [activeStage, setActiveStage] = useState<"packing" | "assignments">("packing");
    const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
    const [assignableCount, setAssignableCount] = useState<number | null>(null);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const selectedIdRef = useRef<number | null>(null);
    const detailRequestSequence = useRef(0);
    const [detail, setDetail] = useState<ShipmentSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadOrders = useCallback(async () => {
        setError("");
        try {
            const result = await fetchFulfillmentOrders();
            setOrders(result);
            const nextSelectedId = selectedIdRef.current && result.some((row) => row.orderId === selectedIdRef.current)
                ? selectedIdRef.current
                : result[0]?.orderId ?? null;
            selectedIdRef.current = nextSelectedId;
            setSelectedId(nextSelectedId);
        } catch {
            setError(t("shipping.adminLoadError"));
        } finally { setLoading(false); }
    }, [t]);

    const loadDetail = useCallback(async (orderId: number) => {
        const requestSequence = ++detailRequestSequence.current;
        try {
            const result = await fetchFulfillmentOrder(orderId);
            if (requestSequence === detailRequestSequence.current && selectedIdRef.current === orderId) setDetail(result);
        } catch {
            if (requestSequence === detailRequestSequence.current && selectedIdRef.current === orderId) {
                setDetail(null);
                setError(t("shipping.adminDetailError"));
            }
        }
    }, [t]);

    useEffect(() => { void loadOrders(); }, [loadOrders]);
    useEffect(() => {
        if (selectedId) void loadDetail(selectedId);
        else setDetail(null);
        return () => { detailRequestSequence.current += 1; };
    }, [loadDetail, selectedId]);

    const act = async (action: () => Promise<unknown>) => {
        if (busy) return;
        setBusy(true); setError(""); setNotice("");
        try {
            await action();
            setNotice(t("shipping.transitionSaved"));
            if (selectedIdRef.current) await loadDetail(selectedIdRef.current);
            await loadOrders();
        } catch { setError(t("shipping.adminActionError")); }
        finally { setBusy(false); }
    };

    const selectedOrder = orders.find((row) => row.orderId === selectedId) || null;
    const state = detail?.state || selectedOrder?.state || "";
    const provider = detail?.provider ?? selectedOrder?.provider ?? null;
    const canManagePacking = provider === null || provider === "INTERNAL";
    const nextStates = canManagePacking ? NEXT[state] || [] : [];
    const stateLabel = (value: string) => {
        const key = `shipping.state.${value}`;
        const translated = t(key);
        return translated === key ? value.replaceAll("_", " ") : translated;
    };

    return <AdminLayout>
        <Helmet><title>{t("shipping.adminTitle")}</title></Helmet>
        <main className="admin__page shipping-admin">
            <header className="admin__page__header">
                <div>
                    <span className="admin__page__eyebrow">{t("shipping.fulfillment")}</span>
                    <h1 className="admin__page__title">{t("shipping.adminTitle")}</h1>
                    <p className="admin__page__subtitle">{t("shipping.adminDescription")}</p>
                </div>
                {activeStage === "packing" ? <button type="button" className="admin__button admin__button--ghost" onClick={() => void loadOrders()} disabled={busy}>{t("shipping.refresh")}</button> : null}
            </header>
            <div className="shipping-admin__stages" role="group" aria-label={t("shipping.fulfillmentStageSelector")}>
                <button type="button" aria-pressed={activeStage === "packing"} onClick={() => setActiveStage("packing")}>
                    {t("shipping.packingStage")}
                </button>
                <button type="button" aria-pressed={activeStage === "assignments"} onClick={() => setActiveStage("assignments")}>
                    {t("shipping.readyToAssignStage")}
                    {assignableCount !== null ? <span className="shipping-admin__stage-count">{assignableCount}</span> : null}
                </button>
            </div>
            <section className="shipping-admin__stage" aria-label={t("shipping.packingStage")} hidden={activeStage !== "packing"}>
                {notice ? <p className="shipping-admin__notice" role="status">{notice}</p> : null}
                {error ? <AdminStatusPanel variant="error" title={t("shipping.adminErrorTitle")} description={error} onRetry={() => void loadOrders()} /> : null}
                {loading ? <AdminStatusPanel variant="loading" title={t("shipping.loadingFulfillment")} description={t("shipping.loadingFulfillmentDescription")} /> : null}
                {!loading && !error && orders.length === 0 ? <AdminStatusPanel variant="empty" title={t("shipping.noFulfillmentOrders")} description={t("shipping.noFulfillmentOrdersDescription")} /> : null}
                {!loading && orders.length > 0 ? <div className="shipping-admin__layout">
                    <section className="shipping-admin__list" aria-label={t("shipping.fulfillmentOrders")}>
                        {orders.map((row) => <button type="button" key={row.orderId} className={row.orderId === selectedId ? "is-active" : ""} onClick={() => { selectedIdRef.current = row.orderId; detailRequestSequence.current += 1; setSelectedId(row.orderId); setDetail(null); }} aria-current={row.orderId === selectedId ? "true" : undefined}>
                            <strong>#{row.orderId}</strong><span>{stateLabel(row.state)}</span>{row.trackingCode ? <small>{row.trackingCode}</small> : null}{row.sandbox ? <em>{t("shipping.sandbox")}</em> : null}
                        </button>)}
                    </section>
                    {selectedOrder ? <section className="shipping-admin__detail" aria-live="polite">
                        <h2>{t("shipping.orderLabel").replace("{id}", String(selectedOrder.orderId))}</h2>
                        <p>{t("shipping.currentState")}: <strong>{stateLabel(state)}</strong></p>
                        {detail?.trackingCode ? <p>{t("shipping.trackingCode")}: <strong>{detail.trackingCode}</strong></p> : null}
                        {detail?.sandbox ? <p className="shipping-admin__sandbox">{t("shipping.sandboxShipment")}</p> : null}
                        {detail?.expectedDeliveryAt ? <p>{t("shipping.expectedDelivery")}: {formatUtcDateTime(detail.expectedDeliveryAt, locale === "vi" ? "vi-VN" : "en-GB")}</p> : null}
                        <div className="shipping-admin__actions">
                            {nextStates.map((next) => <button key={next} type="button" disabled={busy} onClick={() => void act(() => transitionFulfillment(selectedOrder.orderId, next))}>{t(`shipping.state.${next}`)}</button>)}
                        </div>
                        {detail?.timeline?.length ? <section aria-label={t("shipping.deliveryHistory")}><h3>{t("shipping.deliveryHistory")}</h3><ol>{detail.timeline.map((event, index) => <li key={event.id ?? index}><strong>{stateLabel(event.state)}</strong>{event.created_at || event.occurredAt ? <time dateTime={event.created_at || event.occurredAt || undefined}> {formatUtcDateTime(event.created_at || event.occurredAt || "", locale === "vi" ? "vi-VN" : "en-GB")}</time> : null}{event.public_note || event.note ? <p>{event.public_note || event.note}</p> : null}</li>)}</ol></section> : null}
                    </section> : null}
                </div> : null}
            </section>
            <div hidden={activeStage !== "assignments"}>
                <InternalDeliveryAssignmentsPanel onQueueCountChange={setAssignableCount} />
            </div>
        </main>
    </AdminLayout>;
}
