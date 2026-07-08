import { Injectable } from "@nestjs/common";
import type { DbError } from "#src/shared/interfaces/domain";
import type { OrderDetail, OrderTimelineInput, OrderTimelineRow } from "./orders.types";
import { logger } from "#src/shared/utils/logger";
import { OrderTimelineRepository } from "./orders.timeline.repository";

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

@Injectable()
export class NestOrderTimelineService {
    constructor(private readonly orderTimelineRepository: OrderTimelineRepository) {}

    recordTimelineEvent({ orderId, status, note, actorId }: OrderTimelineInput): void {
        // Timeline writes are audit metadata. Log failures for operators, but do not
        // fail the status update or checkout that already succeeded.
        this.orderTimelineRepository.createTimelineEvent(
            {
                orderId,
                status,
                label: statusLabel(status),
                note,
                actorId,
            },
            (err: DbError | null) => {
                if (err) {
                    logger.error({ err, orderId, status }, "Order timeline log failed");
                }
            },
        );
    }

    async getTimeline(orderId: number, fallbackOrder?: Partial<OrderDetail>): Promise<ReturnType<typeof normalizeTimelineEvent>[]> {
        return new Promise((resolve, reject) => {
            this.orderTimelineRepository.getTimelineByOrderId(orderId, (err: DbError | null, rows: OrderTimelineRow[]) => {
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
}
