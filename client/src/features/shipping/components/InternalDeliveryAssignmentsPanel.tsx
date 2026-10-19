import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocale } from "../../../context/LocaleContext";
import { useT } from "../../../hooks/useT";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { assignDeliveryOrder, fetchAssignableDeliveryOrders, fetchDeliveryAssignmentHistory, fetchDeliveryStaff } from "../api";
import type { AssignableDeliveryOrder, DeliveryAssignment, DeliveryStaffMember } from "../types";
import { formatVietnamDateTime, getDefaultVietnamSchedule, toVietnamDateTimeInput } from "../deliveryTime";

type InternalDeliveryAssignmentsPanelProps = {
    onQueueCountChange?: (count: number) => void;
};

const InternalDeliveryAssignmentsPanel = ({ onQueueCountChange }: InternalDeliveryAssignmentsPanelProps) => {
    const t = useT();
    const { locale } = useLocale();
    const [orders, setOrders] = useState<AssignableDeliveryOrder[]>([]);
    const [staff, setStaff] = useState<DeliveryStaffMember[]>([]);
    const [history, setHistory] = useState<DeliveryAssignment[]>([]);
    const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
    const [employeeId, setEmployeeId] = useState("");
    const [scheduleStart, setScheduleStart] = useState("");
    const [scheduleEnd, setScheduleEnd] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const historyRequestId = useRef(0);

    const load = useCallback(async () => {
        setError("");
        try {
            const [nextOrders, nextStaff] = await Promise.all([fetchAssignableDeliveryOrders(), fetchDeliveryStaff()]);
            setOrders(nextOrders);
            onQueueCountChange?.(nextOrders.length);
            setStaff(nextStaff);
            setSelectedOrderId((current) => current && nextOrders.some((order) => order.orderId === current)
                ? current
                : nextOrders[0]?.orderId ?? null);
        } catch {
            setError(t("shipping.deliveryQueueLoadError"));
        } finally {
            setLoading(false);
        }
    }, [onQueueCountChange, t]);

    useEffect(() => { void load(); }, [load]);

    const selectedOrder = useMemo(
        () => orders.find((order) => order.orderId === selectedOrderId) || null,
        [orders, selectedOrderId],
    );

    useEffect(() => {
        if (!selectedOrder) {
            setHistory([]);
            setEmployeeId("");
            setScheduleStart("");
            setScheduleEnd("");
            return;
        }
        setEmployeeId(selectedOrder.currentAssignment?.employeeId || staff[0]?.id || "");
        const defaults = getDefaultVietnamSchedule();
        setScheduleStart(selectedOrder.currentAssignment
            ? toVietnamDateTimeInput(selectedOrder.currentAssignment.scheduledStartAt)
            : defaults.start);
        setScheduleEnd(selectedOrder.currentAssignment
            ? toVietnamDateTimeInput(selectedOrder.currentAssignment.scheduledEndAt)
            : defaults.end);
    }, [selectedOrder, staff]);

    const loadHistory = useCallback(async (orderId: number) => {
        const requestId = ++historyRequestId.current;
        try {
            const nextHistory = await fetchDeliveryAssignmentHistory(orderId);
            if (requestId === historyRequestId.current) setHistory(nextHistory);
        } catch {
            if (requestId === historyRequestId.current) {
                setHistory([]);
                setError(t("shipping.assignmentHistoryError"));
            }
        }
    }, [t]);

    useEffect(() => {
        if (selectedOrderId) void loadHistory(selectedOrderId);
        else {
            historyRequestId.current += 1;
            setHistory([]);
        }
    }, [loadHistory, selectedOrderId]);

    const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedOrder || !employeeId || !scheduleStart || !scheduleEnd || scheduleEnd <= scheduleStart) {
            setError(t("shipping.validScheduleRequired"));
            return;
        }
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await assignDeliveryOrder(selectedOrder.orderId, {
                employeeId,
                scheduledStartAt: scheduleStart,
                scheduledEndAt: scheduleEnd,
            });
            setNotice(t("shipping.assignmentSaved"));
            await load();
            await loadHistory(selectedOrder.orderId);
        } catch (failure) {
            setError(getApiErrorMessage(failure, t("shipping.assignmentSaveError")));
        } finally {
            setBusy(false);
        }
    };

    return <section className="delivery-assignments" aria-labelledby="delivery-assignments-title">
        <header className="delivery-assignments__header">
            <div><span>{t("shipping.fulfillment")}</span><h2 id="delivery-assignments-title">{t("shipping.deliveryQueue")}</h2><p>{t("shipping.deliveryQueueDescription")}</p></div>
            <button type="button" onClick={() => void load()} disabled={busy || loading}>{t("shipping.refresh")}</button>
        </header>
        {notice ? <p role="status" className="shipping-admin__notice">{notice}</p> : null}
        {error ? <div role="alert" className="shipping-admin__notice shipping-admin__notice--error"><p>{error}</p><button type="button" onClick={() => void load()} disabled={loading}>{t("shipping.retry")}</button></div> : null}
        {loading ? <p role="status" aria-live="polite">{t("shipping.deliveryQueueLoading")}</p> : null}
        {!loading && !error && orders.length === 0 ? <p className="delivery-assignments__empty">{t("shipping.deliveryQueueEmpty")}</p> : null}
        {!loading && orders.length > 0 ? <div className="delivery-assignments__layout">
            <div className="delivery-assignments__orders" role="group" aria-label={t("shipping.deliveryQueue")}>
                {orders.map((order) => <button type="button" key={order.orderId}
                    aria-current={order.orderId === selectedOrderId ? "true" : undefined}
                    className={order.orderId === selectedOrderId ? "is-active" : ""}
                    onClick={() => { setSelectedOrderId(order.orderId); setNotice(""); }}>
                    <strong>{t("shipping.orderLabel").replace("{id}", String(order.orderId))}</strong>
                    <span>{order.customerName}</span>
                    <small>{order.currentAssignment ? t("shipping.reassignment") : t("shipping.unassigned")}</small>
                </button>)}
            </div>
            {selectedOrder ? <article className="delivery-assignments__detail" aria-live="polite">
                <h3>{t("shipping.orderLabel").replace("{id}", String(selectedOrder.orderId))}</h3>
                <p><strong>{t("shipping.recipient")}:</strong> {selectedOrder.customerName}</p>
                {selectedOrder.destination ? <>
                    <p><strong>{t("shipping.destinationAddress")}:</strong> {[selectedOrder.destination.addressLine, selectedOrder.destination.city].filter(Boolean).join(", ")}</p>
                    <p><strong>{t("shipping.recipientPhone")}:</strong> {selectedOrder.destination.recipientPhone}</p>
                </> : <p>{t("shipping.addressNotAvailable")}</p>}
                <p><strong>{t("shipping.paymentStatus")}:</strong> {selectedOrder.paymentMethod} · {selectedOrder.paymentStatus}</p>
                {selectedOrder.codAmountVnd > 0 ? <p><strong>{t("shipping.codAmount")}:</strong> {formatCurrency(selectedOrder.codAmountVnd)}</p> : null}
                <section className="delivery-assignments__items" aria-label={t("shipping.orderContents")}>
                    <h4>{t("shipping.orderContents")}</h4>
                    <ul>{selectedOrder.items.map((item, index) => <li key={`${item.sku || item.productName}-${index}`}><span>{item.productName} × {item.quantity}</span><strong>{formatCurrency(item.totalPriceVnd)}</strong></li>)}</ul>
                </section>
                {selectedOrder.currentAssignment ? <p className="delivery-assignments__current"><strong>{t("shipping.assignedTo")}:</strong> {selectedOrder.currentAssignment.employeeName}; {formatVietnamDateTime(selectedOrder.currentAssignment.scheduledStartAt, locale)} – {formatVietnamDateTime(selectedOrder.currentAssignment.scheduledEndAt, locale)} ({t("shipping.vietnamTime")})</p> : null}
                <form className="delivery-assignments__form" onSubmit={handleAssign}>
                    <h4>{selectedOrder.currentAssignment ? t("shipping.reassignDelivery") : t("shipping.assignDelivery")}</h4>
                    {staff.length === 0 ? <p role="alert">{t("shipping.noDeliveryStaff")}</p> : null}
                    <label>{t("shipping.deliveryStaff")}
                        <select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                            <option value="">{t("shipping.selectDeliveryStaff")}</option>
                            {staff.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                        </select>
                    </label>
                    <div className="delivery-assignments__schedule">
                        <label>{t("shipping.scheduleStart")} ({t("shipping.vietnamTime")})<input type="datetime-local" required value={scheduleStart} onChange={(event) => setScheduleStart(event.target.value)} /></label>
                        <label>{t("shipping.scheduleEnd")} ({t("shipping.vietnamTime")})<input type="datetime-local" required value={scheduleEnd} onChange={(event) => setScheduleEnd(event.target.value)} /></label>
                    </div>
                    <button type="submit" disabled={busy || staff.length === 0 || scheduleEnd <= scheduleStart || !employeeId}>
                        {busy ? t("shipping.savingAssignment") : selectedOrder.currentAssignment ? t("shipping.reassignDelivery") : t("shipping.assignDelivery")}
                    </button>
                </form>
                <section className="delivery-assignments__history" aria-label={t("shipping.deliveryHistory")}>
                    <h4>{t("shipping.deliveryHistory")}</h4>
                    {history.length ? <ol>{history.map((assignment) => <li key={assignment.id}>
                        <strong>{assignment.employeeName} · {t(`shipping.state.${assignment.status}`)}</strong>
                        <span>{formatVietnamDateTime(assignment.scheduledStartAt, locale)} – {formatVietnamDateTime(assignment.scheduledEndAt, locale)}</span>
                        {assignment.failureReason ? <small>{assignment.failureReason}</small> : null}
                    </li>)}</ol> : <p>{t("shipping.noDeliveryHistory")}</p>}
                </section>
            </article> : null}
        </div> : null}
    </section>;
};

export default InternalDeliveryAssignmentsPanel;
