const OrderTimeline = require("../models/orderTimelineModel");

const statusLabel = (status) => {
    if (Number(status) === 1) return "Completed";
    if (Number(status) === 2) return "Canceled";
    return "Placed";
};

const normalizeTimelineEvent = (event = {}) => ({
    id: Number(event.id),
    order_id: Number(event.order_id),
    status: Number(event.status),
    label: event.label,
    note: event.note,
    actor_id: event.actor_id,
    created_at: event.created_at,
});

function recordTimelineEvent({ orderId, status, note, actorId }) {
    OrderTimeline.createTimelineEvent(
        {
            orderId,
            status,
            label: statusLabel(status),
            note,
            actorId,
        },
        (err) => {
            if (err) {
                console.error("Order timeline log failed:", err.message);
            }
        }
    );
}

async function getTimeline(orderId, fallbackOrder) {
    return new Promise((resolve, reject) => {
        OrderTimeline.getTimelineByOrderId(orderId, (err, rows) => {
            if (err) return reject(err);
            const timeline = (rows || []).map(normalizeTimelineEvent);
            if (timeline.length > 0) {
                resolve(timeline);
                return;
            }

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
