import { Injectable, ConflictException, ForbiddenException } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import { TasksService } from "../operations/tasks.service";
import type { TaskLease, TaskResult } from "../operations/tasks.types";
import { hashTaskPayload } from "../operations/tasks.policy";
import { ShippingProviderRegistry } from "./shipping.registry";
import { FulfillmentService } from "./fulfillment.service";
import { ShippingRepository, type ShipmentRow } from "./shipping.repository";
import { carrierWebhookSchema, verifyCarrierSecret } from "./shipping-webhook.validator";

@Injectable()
export class ShippingWebhookService {
    constructor(private readonly tasks: TasksService, private readonly registry: ShippingProviderRegistry, private readonly fulfillment: FulfillmentService, private readonly repository: ShippingRepository) {}
    async accept(input: unknown, headers: Record<string, string | string[] | undefined>) {
        verifyCarrierSecret(process.env.GHN_WEBHOOK_SECRET, typeof headers["x-digital-e-webhook-secret"] === "string" ? headers["x-digital-e-webhook-secret"] : undefined);
        const payload = carrierWebhookSchema.parse(input);
        if (!process.env.GHN_SHOP_ID || payload.ShopID !== Number(process.env.GHN_SHOP_ID)) throw new ForbiddenException("Carrier shop does not match");
        const eventKey = hashTaskPayload({ order: payload.OrderCode, type: payload.Type, time: payload.Time });
        return withTransaction(async (tx) => {
            const [shipment] = await tx.query<ShipmentRow[]>("SELECT * FROM shipments WHERE provider_order_code = ? AND client_reference = ?", [payload.OrderCode, payload.ClientOrderCode]);
            if (!shipment) return { kind: "ignored" as const };
            await this.repository.lockOrder(tx, shipment.order_id);
            const [existing] = await tx.query<Array<{ id: number }>>("SELECT id FROM shipment_events WHERE provider_event_key = ?", [eventKey]);
            if (existing) return { kind: "duplicate" as const, eventId: existing.id };
            const result = await tx.query<{ insertId: number }>("INSERT INTO shipment_events (shipment_id, state, public_note, provider_event_key, provider_payload) VALUES (?, 'RECEIVED', 'Carrier callback received', ?, ?)", [shipment.id, eventKey, JSON.stringify(payload)]);
            await this.tasks.enqueue(tx, { kind: "SHIPMENT_SYNC", key: eventKey, payload: { eventId: result.insertId } });
            return { kind: "queued" as const, eventId: result.insertId };
        });
    }
    async processEvent(lease: TaskLease): Promise<TaskResult> {
        const eventId = Number((lease.payload as { eventId: number }).eventId);
        const event = await withTransaction(async (tx) => {
            const [row] = await tx.query<Array<{ order_id: number; provider_order_code: string; provider_payload: string | object; processed_at: Date | null }>>("SELECT s.order_id, s.provider_order_code, e.provider_payload, e.processed_at FROM shipment_events e JOIN shipments s ON s.id = e.shipment_id WHERE e.id = ?", [eventId]);
            return row;
        });
        if (!event) return { kind: "permanent", reason: "carrier_event_missing" };
        if (event.processed_at) return { kind: "success", providerReference: event.provider_order_code };
        try {
            const payload = carrierWebhookSchema.parse(typeof event.provider_payload === "string" ? JSON.parse(event.provider_payload) : event.provider_payload);
            const carrier = await this.registry.get().lookup(event.provider_order_code);
            if (carrier.clientReference !== payload.ClientOrderCode || carrier.codAmountVnd !== payload.CODAmount || !carrier.providerUpdatedAt || Date.parse(carrier.providerUpdatedAt) < Date.parse(payload.Time)) throw new ConflictException("Authenticated carrier data differs");
            await withTransaction(async (tx) => {
                await this.repository.lockOrder(tx, event.order_id);
                const [owned] = await tx.query<Array<{ id: number }>>("SELECT id FROM operations_tasks WHERE id = ? AND lease_token = ? AND state = 'RUNNING' AND lease_expires_at > UTC_TIMESTAMP(3) FOR UPDATE", [lease.id, lease.token]);
                if (!owned) throw new ConflictException("Carrier task lease expired");
                await this.fulfillment.applyCarrier(tx, event.order_id, carrier);
                await tx.query("UPDATE shipment_events SET processed_at = UTC_TIMESTAMP(3) WHERE id = ?", [eventId]);
            });
            return { kind: "success", providerReference: carrier.orderCode };
        } catch (error) {
            if (error instanceof ConflictException) return { kind: "ambiguous", reason: "carrier_event_requires_review" };
            return { kind: "retryable", reason: "carrier_lookup_unavailable" };
        }
    }
}
