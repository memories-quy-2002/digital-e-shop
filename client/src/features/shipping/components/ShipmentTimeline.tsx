import { formatUtcDateTime } from "../../../utils/dateTime";
import { useT } from "../../../hooks/useT";
import { useLocale } from "../../../context/LocaleContext";
import type { ShipmentSummary } from "../types";
import { formatVietnamDateTime } from "../deliveryTime";
import "../../../styles/features/shipping/_shipping.scss";

const ShipmentTimeline = ({ shipment }: { shipment: ShipmentSummary | null }) => {
    const t = useT();
    const { locale } = useLocale();
    const stateLabel = (state: string) => {
        const key = `shipping.state.${state}`;
        const translated = t(key);
        return translated === key ? state.replaceAll("_", " ") : translated;
    };
    if (!shipment) return <p className="shipment-timeline__empty">{t("shipping.noShipment")}</p>;
    const shipmentEvents = shipment.events || shipment.timeline?.map((event) => ({
        state: event.state,
        occurredAt: event.occurredAt ?? event.created_at ?? null,
        note: event.note ?? event.public_note ?? null,
    })) || [];
    const deliveryEvents = shipment.delivery?.events.map((event) => ({
        state: event.status || "ASSIGNED",
        occurredAt: event.createdAt,
        note: event.publicNote,
    })) || [];
    const events = [...shipmentEvents, ...deliveryEvents].sort((first, second) =>
        Date.parse(first.occurredAt || "") - Date.parse(second.occurredAt || ""));
    const currentStatus = shipment.delivery?.status || shipment.state;
    return <section className="shipment-timeline" aria-label={t("shipping.timeline")}>
        <header><h3>{t("shipping.timeline")}</h3><strong>{stateLabel(currentStatus)}</strong></header>
        {shipment.delivery ? <div className="shipment-timeline__assignment">
            <p><strong>{t("shipping.assignedTo")}:</strong> {shipment.delivery.employeeName}</p>
            <p><strong>{t("shipping.schedule")}:</strong> <time dateTime={shipment.delivery.scheduledStartAt}>{formatVietnamDateTime(shipment.delivery.scheduledStartAt, locale)}</time> – <time dateTime={shipment.delivery.scheduledEndAt}>{formatVietnamDateTime(shipment.delivery.scheduledEndAt, locale)}</time> ({t("shipping.vietnamTime")})</p>
        </div> : null}
        {shipment.trackingCode ? <p>{t("shipping.trackingCode")}: <strong>{shipment.trackingCode}</strong></p> : null}
        {shipment.sandbox ? <p className="shipment-timeline__sandbox">{t("shipping.sandboxShipment")}</p> : null}
        {events.length ? <ol>{events.map((event, index) => <li key={`${event.state}-${event.occurredAt || index}`}><strong>{stateLabel(event.state)}</strong>{event.occurredAt ? <time dateTime={event.occurredAt}>{formatUtcDateTime(event.occurredAt)}</time> : null}{event.note ? <p>{event.note}</p> : null}</li>)}</ol> : <p>{t("shipping.timelinePending")}</p>}
    </section>;
};

export default ShipmentTimeline;
