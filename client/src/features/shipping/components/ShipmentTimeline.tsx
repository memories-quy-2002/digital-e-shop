import { formatUtcDateTime } from "../../../utils/dateTime";
import { useT } from "../../../hooks/useT";
import type { ShipmentSummary } from "../types";
import "../../../styles/features/shipping/_shipping.scss";

const ShipmentTimeline = ({ shipment }: { shipment: ShipmentSummary | null }) => {
    const t = useT();
    const stateLabel = (state: string) => {
        const key = `shipping.state.${state}`;
        const translated = t(key);
        return translated === key ? state.replaceAll("_", " ") : translated;
    };
    if (!shipment) return <p className="shipment-timeline__empty">{t("shipping.noShipment")}</p>;
    const events = shipment.events || shipment.timeline?.map((event) => ({
        state: event.state,
        occurredAt: event.occurredAt ?? event.created_at ?? null,
        note: event.note ?? event.public_note ?? null,
    })) || [];
    return <section className="shipment-timeline" aria-label={t("shipping.timeline")}>
        <header><h3>{t("shipping.timeline")}</h3><strong>{stateLabel(shipment.state)}</strong></header>
        {shipment.trackingCode ? <p>{t("shipping.trackingCode")}: <strong>{shipment.trackingCode}</strong></p> : null}
        {shipment.sandbox ? <p className="shipment-timeline__sandbox">{t("shipping.sandboxShipment")}</p> : null}
        {events.length ? <ol>{events.map((event, index) => <li key={`${event.state}-${event.occurredAt || index}`}><strong>{stateLabel(event.state)}</strong>{event.occurredAt ? <time dateTime={event.occurredAt}>{formatUtcDateTime(event.occurredAt)}</time> : null}{event.note ? <p>{event.note}</p> : null}</li>)}</ol> : <p>{t("shipping.timelinePending")}</p>}
    </section>;
};

export default ShipmentTimeline;
