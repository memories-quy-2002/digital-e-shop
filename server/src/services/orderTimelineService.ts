const OrderTimeline = require("../models/orderTimelineModel");
import type { DbError, OrderDetail, OrderTimelineInput, OrderTimelineRow } from "../types/domain";

const statusLabel = (status: number) => {
    if (Number(status) === 1) return "Completed";
    if (Number(status) === 2) return "Canceled";
    return "Placed";
};

const normalizeTimelineEvent = (event: OrderTimelineRow) => ({
    id: Number(event.id),
    order_id: Number(event.order_id),
    status: Number(event.status),
    label: event.label,
    note: event.note,
    actor_id: event.actor_id,
    created_at: event.created_at,
});

function recordTimelineEvent({ orderId, status, note, actorId }: OrderTimelineInput) {
    // Timeline writes are audit metadata. Log failures for operators, but do not
    // fail the status update or checkout that already succeeded.
    OrderTimeline.createTimelineEvent(
        {
            orderId,
            status,
            label: statusLabel(status),
            note,
            actorId,
        },
        (err: DbError | null) => {
            if (err) {
                console.error("Order timeline log failed:", err.message);
            }
        }
    );
}

async function getTimeline(orderId: number, fallbackOrder?: Partial<OrderDetail>): Promise<ReturnType<typeof normalizeTimelineEvent>[]> {
    return new Promise((resolve, reject) => {
        OrderTimeline.getTimelineByOrderId(orderId, (err: DbError | null, rows: OrderTimelineRow[]) => {
            if (err) return reject(err);
            const timeline = (rows || []).map(normalizeTimelineEvent);
            if (timeline.length > 0) {
                resolve(timeline);
                return;
            }

            // Older orders may predate timeline records. Return a synthetic first
            // event so the UI can render a consistent timeline.
            resolve([
                {
                    id: 0,
                    order_id: Number(orderId),
                    status: Number(fallbackOrder?.status ?? 0),
                    label: "Placed",
                    note: "Order was placed.",
                    actor_id: fallbackOrder?.user_id || null,
                    created_at: fallbackOrder?.date_added || null,
                },
            ]);
        });
    });
}

module.exports = {
    recordTimelineEvent,
    getTimeline,
};
