import { Injectable, ConflictException } from "@nestjs/common";
import { withTransaction, type TransactionContext } from "../database/transaction";
import { TasksService } from "../operations/tasks.service";
import type { TaskLease, TaskResult } from "../operations/tasks.types";
import { ShippingRepository } from "./shipping.repository";
import { ShippingProviderRegistry } from "./shipping.registry";
import { assertCanShip, assertFulfillmentTransition, carrierState, type FulfillmentState } from "./fulfillment.policy";
import { completeDeliveredOrder } from "../orders/order-delivery";
import type { CarrierShipment } from "./shipping.types";
import { NestOrdersCancellationService } from "../orders/orders-cancellation.service";
import { CodSettlementService } from "../payments/cod-settlement.service";
import { OrderEmailService } from "../orders/order-email.service";

@Injectable()
export class FulfillmentService {
    constructor(private readonly repository: ShippingRepository, private readonly tasks: TasksService, private readonly registry: ShippingProviderRegistry, private readonly cancellation: NestOrdersCancellationService, private readonly cod: CodSettlementService, private readonly emails: OrderEmailService) {}
    transition(orderId: number, next: FulfillmentState, actorId: string) {
        return withTransaction(async (tx) => {
            const order = await this.repository.lockOrder(tx, orderId);
            const shipment = await this.repository.ensureShipment(tx, order);
            if (order.status !== 0 || !["CONFIRMED", "PICKING", "PACKED", "READY_TO_SHIP"].includes(next)) throw new ConflictException("Only packing states can be changed manually");
            if (shipment.state === next) return this.repository.summary(tx, orderId);
            assertFulfillmentTransition(shipment.state, next);
            await tx.query("UPDATE shipments SET state = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [next, shipment.id]);
            const event = await this.repository.event(tx, shipment.id, next, actorId, "Packing status updated") as { insertId: number };
            await this.emails.emit(tx, orderId, "shipment", { key: `shipment:${shipment.id}:event:${event.insertId}`, status: next });
            return this.repository.summary(tx, orderId);
        });
    }
    requestShipment(orderId: number, actorId: string, key: string) {
        return withTransaction(async (tx) => {
            const order = await this.repository.lockOrder(tx, orderId);
            const shipment = await this.repository.ensureShipment(tx, order);
            const [payment] = await tx.query<Array<{ provider: string; status: string; simulated: number }>>("SELECT provider, status, simulated FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [orderId]);
            assertCanShip(shipment.state, { status: Number(order.status), currency: order.currency, provider: payment?.provider, paymentStatus: payment?.status, simulated: Boolean(payment?.simulated) });
            // One immutable creation key per order; operator retries cannot mint a second parcel.
            if (!key || key.length > 191) throw new ConflictException("An operation key is required");
            const taskId = await this.tasks.enqueue(tx, { kind: "SHIPMENT_CREATE", key: shipment.client_reference, payload: { orderId } });
            await this.repository.event(tx, shipment.id, shipment.state, actorId, "Shipment creation requested");
            return { taskId, businessKey: shipment.client_reference, state: "READY", providerReference: shipment.provider_order_code };
        });
    }
    summary(orderId: number) { return withTransaction((tx) => this.repository.summary(tx, orderId)); }
    confirmReturnedStock(orderId: number, actorId: string) {
        return withTransaction(async (tx) => {
            await this.repository.lockOrder(tx, orderId);
            const shipment = await this.repository.lockShipment(tx, orderId);
            if (!shipment || shipment.state !== "RETURNED") throw new ConflictException("Only a returned parcel can be received");
            if (!shipment.stock_received_at) {
                await tx.query("UPDATE shipments SET stock_received_at = UTC_TIMESTAMP(3) WHERE id = ?", [shipment.id]);
                await this.cancellation.cancelInTransaction(tx, orderId, actorId, true, "Returned outbound parcel physically received");
                await this.repository.event(tx, shipment.id, "RETURNED", actorId, "Returned parcel physically received");
            }
            return this.repository.summary(tx, orderId);
        });
    }
    async processShipment(lease: TaskLease): Promise<TaskResult> {
        const orderId = Number((lease.payload as { orderId: number }).orderId);
        const input = await withTransaction(async (tx) => {
            const order = await this.repository.lockOrder(tx, orderId);
            const shipment = await this.repository.lockShipment(tx, orderId);
            if (!shipment) throw new ConflictException("Shipment is missing");
            const delivery = this.repository.delivery(order);
            return { order, shipment, delivery };
        });
        if (input.shipment.provider_order_code) return { kind: "success", providerReference: input.shipment.provider_order_code };
        if (input.order.status !== 0 || input.shipment.state !== "READY_TO_SHIP") return { kind: "permanent", reason: "shipment_no_longer_eligible" };
        try {
            const provider = this.registry.get();
            let result = await provider.findByClientReference(input.shipment.client_reference);
            if (!result) {
                // A crashed previous attempt might have been accepted. Never create blindly again.
                if (lease.attempt > 1) return { kind: "ambiguous", reason: "shipment_creation_outcome_unknown" };
                result = await provider.createShipment({ clientReference: input.shipment.client_reference, address: input.delivery.address, parcel: input.delivery.parcel, service: { serviceTypeId: input.delivery.serviceTypeId }, codAmountVnd: Number(input.shipment.expected_cod_vnd), orderValueVnd: Number(input.order.total_price) - Number(input.order.discount) });
            }
            if (result.clientReference !== input.shipment.client_reference || result.codAmountVnd !== Number(input.shipment.expected_cod_vnd)) return { kind: "ambiguous", reason: "carrier_creation_mismatch" };
            const persisted = await withTransaction(async (tx) => {
                await this.repository.lockOrder(tx, orderId);
                const [ownedLease] = await tx.query<Array<{ id: number }>>("SELECT id FROM operations_tasks WHERE id = ? AND lease_token = ? AND state = 'RUNNING' AND lease_expires_at > UTC_TIMESTAMP(3) FOR UPDATE", [lease.id, lease.token]);
                if (!ownedLease) return false;
                await tx.query("UPDATE shipments SET provider_order_code = ?, actual_fee_vnd = ?, expected_delivery_at = ?, sandbox = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ? AND provider_order_code IS NULL", [result.orderCode, result.carrierFeeVnd, result.expectedDeliveryAt ? new Date(result.expectedDeliveryAt) : null, result.sandbox, input.shipment.id]);
                await this.repository.event(tx, input.shipment.id, "READY_TO_SHIP", null, result.sandbox ? "Local sandbox parcel created" : "Carrier parcel created");
                return true;
            });
            return persisted ? { kind: "success", providerReference: result.orderCode } : { kind: "ambiguous", reason: "shipment_lease_lost" };
        } catch { return { kind: "retryable", reason: "carrier_creation_unavailable" }; }
    }
    async applyCarrier(tx: TransactionContext, orderId: number, carrier: CarrierShipment) {
        const order = await this.repository.lockOrder(tx, orderId);
        const shipment = await this.repository.lockShipment(tx, orderId);
        if (!shipment || shipment.provider_order_code !== carrier.orderCode || shipment.client_reference !== carrier.clientReference) throw new ConflictException("Carrier reference does not match");
        if (carrier.codAmountVnd !== Number(shipment.expected_cod_vnd)) throw new ConflictException("Carrier collection differs from expected amount");
        const next = carrierState(carrier.status);
        if (!next) throw new ConflictException("Carrier status requires review");
        if (!carrier.providerUpdatedAt) throw new ConflictException("Carrier timestamp is missing");
        const timestamp = new Date(carrier.providerUpdatedAt);
        if ((shipment.provider_updated_at && timestamp <= new Date(shipment.provider_updated_at)) || shipment.state === next) return false;
        if (["DELIVERED", "RETURNED", "CANCELED"].includes(shipment.state) || order.status !== 0) return false;
        // Missed in-transit callbacks may lead directly from ready to delivered.
        if (shipment.state === "READY_TO_SHIP" && ["DELIVERED", "DELIVERY_FAILED", "RETURNING", "RETURNED"].includes(next)) {
            await tx.query("UPDATE shipments SET state = 'SHIPPED' WHERE id = ?", [shipment.id]);
            shipment.state = "SHIPPED";
        }
        if (next === "RETURNED" && shipment.state === "SHIPPED") shipment.state = "RETURNING";
        assertFulfillmentTransition(shipment.state, next);
        await tx.query("UPDATE shipments SET state = ?, provider_updated_at = ?, actual_fee_vnd = ?, delivered_at = IF(? = 'DELIVERED', COALESCE(delivered_at, ?), delivered_at), updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [next, timestamp, carrier.carrierFeeVnd, next, timestamp, shipment.id]);
        if (next === "DELIVERED") {
            await this.cod.recordCollection(tx, orderId, Number(shipment.expected_cod_vnd));
            await completeDeliveredOrder(tx, orderId, timestamp, null);
        }
        const event = await this.repository.event(tx, shipment.id, next, null, "Carrier status verified") as { insertId: number };
        await this.emails.emit(tx, orderId, "shipment", { key: `shipment:${shipment.id}:event:${event.insertId}`, status: next, trackingCode: carrier.orderCode });
        return true;
    }
}
