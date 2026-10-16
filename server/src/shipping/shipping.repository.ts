import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { FulfillmentState } from "./fulfillment.policy";
import { parseJson } from "./shipping-json";

export type ShipmentRow = { id: number; order_id: number; state: FulfillmentState; provider: string; client_reference: string; provider_order_code: string | null; expected_cod_vnd: number; actual_fee_vnd: number | null; expected_delivery_at: Date | null; delivered_at: Date | null; provider_updated_at: Date | null; stock_received_at: Date | null; sandbox: number };
export type ShippingOrder = { id: number; status: number; currency: string; total_price: number; discount: number; user_id: string | null; guest_email: string | null; guest_name: string | null; email: string | null; delivery_snapshot: string | object | null; pricing_snapshot: string | object | null };
@Injectable()
export class ShippingRepository {
    async lockOrder(tx: TransactionContext, id: number) {
        const [row] = await tx.query<ShippingOrder[]>("SELECT o.*, u.email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ? FOR UPDATE", [id]);
        if (!row) throw new NotFoundException("Order not found");
        return row;
    }
    async lockShipment(tx: TransactionContext, orderId: number) {
        const [row] = await tx.query<ShipmentRow[]>("SELECT * FROM shipments WHERE order_id = ? FOR UPDATE", [orderId]);
        return row || null;
    }
    async ensureShipment(tx: TransactionContext, order: ShippingOrder) {
        const existing = await this.lockShipment(tx, order.id);
        if (existing) return existing;
        if (!order.delivery_snapshot || order.currency !== "VND" || order.status !== 0) throw new ConflictException("Historical or terminal orders cannot start a shipment");
        const [payment] = await tx.query<Array<{ provider: string }>>("SELECT provider FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [order.id]);
        if (!payment) throw new ConflictException("Order payment ledger is missing");
        const delivery = parseJson<{ provider: string }>(order.delivery_snapshot);
        if (delivery.provider !== "INTERNAL") throw new ConflictException("Historical shipments cannot start internal fulfillment");
        await tx.query("INSERT INTO shipments (order_id, provider, client_reference, expected_cod_vnd, actual_fee_vnd, sandbox) VALUES (?, ?, ?, ?, 0, 0)", [order.id, delivery.provider, `digital-e-order-${order.id}`, payment.provider === "cash" ? Number(order.total_price) - Number(order.discount) : 0]);
        await tx.query("INSERT INTO cod_settlements (order_id, expected_cod_vnd, currency) VALUES (?, ?, 'VND') ON DUPLICATE KEY UPDATE order_id = VALUES(order_id)", [order.id, payment.provider === "cash" ? Number(order.total_price) - Number(order.discount) : 0]);
        return (await this.lockShipment(tx, order.id))!;
    }
    async initializeOrderShipment(tx: TransactionContext, orderId: number) {
        const order = await this.lockOrder(tx, orderId);
        return this.ensureShipment(tx, order);
    }
    event(tx: TransactionContext, shipmentId: number, state: string, actorId: string | null, note: string) {
        return tx.query("INSERT INTO shipment_events (shipment_id, state, actor_id, public_note) VALUES (?, ?, ?, ?)", [shipmentId, state, actorId, note]);
    }
    async summary(tx: TransactionContext, orderId: number) {
        const shipment = await this.lockShipment(tx, orderId);
        if (!shipment) return null;
        const timeline = await tx.query<Array<{ id: number; state: string; public_note: string; created_at: Date }>>("SELECT id, state, public_note, created_at FROM shipment_events WHERE shipment_id = ? ORDER BY id DESC LIMIT 100", [shipment.id]);
        return { orderId, state: shipment.state, provider: shipment.provider, trackingCode: shipment.provider_order_code, expectedDeliveryAt: shipment.expected_delivery_at, deliveredAt: shipment.delivered_at, sandbox: Boolean(shipment.sandbox), stockReceived: Boolean(shipment.stock_received_at), timeline: timeline.reverse() };
    }
}
