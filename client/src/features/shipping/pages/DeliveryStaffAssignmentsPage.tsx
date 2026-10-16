import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import Layout from "../../../components/layout/Layout";
import { useLocale } from "../../../context/LocaleContext";
import { useT } from "../../../hooks/useT";
import { formatCurrency } from "../../../utils/currency";
import { getApiErrorMessage } from "../../../lib/api-contract";
import { fetchDeliveryStaffAssignments, updateDeliveryStaffAssignment } from "../api";
import type { DeliveryAssignment, DeliveryStatus } from "../types";
import { formatVietnamDateTime } from "../deliveryTime";
import "../../../styles/features/shipping/_shipping.scss";

const DeliveryStaffAssignmentsPage = () => {
    const t = useT();
    const { locale } = useLocale();
    const [assignments, setAssignments] = useState<DeliveryAssignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [failureAssignmentId, setFailureAssignmentId] = useState<number | null>(null);
    const [failureReason, setFailureReason] = useState("");

    const loadAssignments = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setAssignments(await fetchDeliveryStaffAssignments());
        } catch {
            setError(t("shipping.staffLoadError"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { void loadAssignments(); }, [loadAssignments]);

    const updateStatus = async (assignmentId: number, status: Exclude<DeliveryStatus, "ASSIGNED">, reason?: string) => {
        setBusyId(assignmentId);
        setError("");
        setNotice("");
        try {
            const updated = await updateDeliveryStaffAssignment(assignmentId, {
                status,
                ...(reason ? { failureReason: reason.trim() } : {}),
            });
            setAssignments((current) => current.map((assignment) => assignment.id === assignmentId ? updated : assignment));
            setFailureAssignmentId(null);
            setFailureReason("");
            const noticeKey = status === "DELIVERED" ? "shipping.statusDelivered"
                : status === "DELIVERY_FAILED" ? "shipping.statusFailed" : "shipping.statusStarted";
            setNotice(t(noticeKey));
        } catch (failure) {
            setError(getApiErrorMessage(failure, t("shipping.staffActionError")));
        } finally {
            setBusyId(null);
        }
    };

    return <Layout>
        <Helmet><title>{t("shipping.staffTitle")}</title></Helmet>
        <main className="delivery-staff">
            <header className="delivery-staff__header">
                <span>{t("shipping.staffEyebrow")}</span>
                <h1>{t("shipping.staffTitle")}</h1>
                <p>{t("shipping.staffDescription")}</p>
                <button type="button" onClick={() => void loadAssignments()} disabled={loading || busyId !== null}>{t("shipping.refresh")}</button>
            </header>
            {notice ? <p role="status" className="shipping-admin__notice">{notice}</p> : null}
            {error ? <div className="shipping-admin__notice shipping-admin__notice--error" role="alert"><p>{error}</p><button type="button" onClick={() => void loadAssignments()}>{t("shipping.retry")}</button></div> : null}
            {loading ? <p role="status" aria-live="polite">{t("shipping.staffLoading")}</p> : null}
            {!loading && !error && assignments.length === 0 ? <div className="delivery-staff__empty"><h2>{t("shipping.staffEmpty")}</h2><p>{t("shipping.staffEmptyDescription")}</p></div> : null}
            {!loading && assignments.length > 0 ? <div className="delivery-staff__list">
                {assignments.map((assignment) => {
                    const order = assignment.order;
                    const destination = order?.destination;
                    const address = destination ? [destination.addressLine, destination.city].filter(Boolean).join(", ") : t("shipping.addressNotAvailable");
                    const status = assignment.status;
                    return <article key={assignment.id} className="delivery-staff__card">
                        <header>
                            <div><span>{t("shipping.orderLabel").replace("{id}", String(assignment.orderId))}</span><h2>{destination?.recipientName || t("shipping.recipient")}</h2></div>
                            <strong className={`delivery-status delivery-status--${status.toLowerCase().replaceAll("_", "-")}`}>{t(`shipping.state.${status}`)}</strong>
                        </header>
                        {destination ? <div className="delivery-staff__contact"><p><strong>{t("shipping.destinationAddress")}:</strong> {address}</p><p><strong>{t("shipping.recipientPhone")}:</strong> <a href={`tel:${destination.recipientPhone}`}>{destination.recipientPhone}</a></p></div> : <p>{address}</p>}
                        <p><strong>{t("shipping.schedule")}:</strong> <time dateTime={assignment.scheduledStartAt}>{formatVietnamDateTime(assignment.scheduledStartAt, locale)}</time> – <time dateTime={assignment.scheduledEndAt}>{formatVietnamDateTime(assignment.scheduledEndAt, locale)}</time> ({t("shipping.vietnamTime")})</p>
                        {order?.codAmountVnd ? <p><strong>{t("shipping.codAmount")}:</strong> {formatCurrency(order.codAmountVnd)}</p> : null}
                        <section className="delivery-staff__items" aria-label={t("shipping.orderContents")}>
                            <h3>{t("shipping.orderContents")}</h3>
                            {order?.items?.length ? <ul>{order.items.map((item, index) => <li key={`${item.sku || item.productName}-${index}`}><span>{item.productName} × {item.quantity}</span><strong>{formatCurrency(item.totalPriceVnd)}</strong></li>)}</ul> : <p>{t("shipping.noOrderContents")}</p>}
                        </section>
                        {assignment.events.length > 0 ? <ol className="delivery-staff__events" aria-label={t("shipping.deliveryHistory")}>
                            {assignment.events.map((event) => <li key={event.id}><strong>{event.status ? t(`shipping.state.${event.status}`) : event.publicNote}</strong><time dateTime={event.createdAt}>{formatVietnamDateTime(event.createdAt, locale)}</time></li>)}
                        </ol> : null}
                        {assignment.failureReason ? <p role="status"><strong>{t("shipping.failureReason")}:</strong> {assignment.failureReason}</p> : null}
                        <div className="delivery-staff__actions">
                            {status === "ASSIGNED" ? <button type="button" onClick={() => void updateStatus(assignment.id, "OUT_FOR_DELIVERY")} disabled={busyId !== null}>{busyId === assignment.id ? t("shipping.savingStatus") : t("shipping.startDelivery")}</button> : null}
                            {status === "OUT_FOR_DELIVERY" ? <>
                                <button type="button" onClick={() => void updateStatus(assignment.id, "DELIVERED")} disabled={busyId !== null}>{busyId === assignment.id ? t("shipping.savingStatus") : t("shipping.markDelivered")}</button>
                                {failureAssignmentId === assignment.id ? <div className="delivery-staff__failure">
                                    <label>{t("shipping.failureReason")}<textarea value={failureReason} maxLength={500} onChange={(event) => setFailureReason(event.target.value)} /></label>
                                    <button type="button" onClick={() => void updateStatus(assignment.id, "DELIVERY_FAILED", failureReason)} disabled={busyId !== null || failureReason.trim().length < 3}>{t("shipping.confirmFailure")}</button>
                                    <button type="button" className="shipping-quote__secondary" onClick={() => { setFailureAssignmentId(null); setFailureReason(""); }}>{t("shipping.cancelFailure")}</button>
                                </div> : <button type="button" className="shipping-quote__secondary" onClick={() => setFailureAssignmentId(assignment.id)}>{t("shipping.reportFailure")}</button>}
                            </> : null}
                        </div>
                    </article>;
                })}
            </div> : null}
        </main>
    </Layout>;
};

export default DeliveryStaffAssignmentsPage;
