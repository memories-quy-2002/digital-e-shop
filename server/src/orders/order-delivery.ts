import type { TransactionContext } from "../database/transaction";
import { createCheckoutError } from "./orders.errors";

/** Shared by internal delivery completion and the legacy admin completion path. */
export async function completeDeliveredOrder(tx: TransactionContext, orderId: number, deliveryAt: Date, actor: string | null): Promise<boolean> {
    const [order] = await tx.query<Array<{ status: number; delivery_snapshot?: object | string | null }>>("SELECT status, delivery_snapshot FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (!order) throw createCheckoutError("Order not found", 404);
    if (Number(order.status) === 1) return false; // Never restart a historical warranty clock.
    if (Number(order.status) !== 0) throw createCheckoutError("Canceled order cannot be delivered");
    const [payment] = await tx.query<Array<{ id: number; provider: string; status: string; simulated: number }>>("SELECT id, provider, status, simulated FROM order_payments WHERE order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE", [orderId]);
    if (payment?.provider === "payos" && payment.simulated) throw createCheckoutError("Simulated PayOS payments cannot be marked delivered");
    if (!payment || (payment.provider === "payos" && payment.status !== "paid")) throw createCheckoutError("PayOS payment must be paid before delivery");
    if (!["cash", "payos"].includes(payment.provider)) throw createCheckoutError("Historical payment is read-only");
    const [shipment] = await tx.query<Array<{ state: string; provider: string }>>("SELECT state, provider FROM shipments WHERE order_id = ? FOR UPDATE", [orderId]);
    let deliveryProvider: string | null;
    try {
        const snapshot = typeof order.delivery_snapshot === "string" ? JSON.parse(order.delivery_snapshot) : order.delivery_snapshot;
        deliveryProvider = snapshot && typeof snapshot === "object" && "provider" in snapshot ? String(snapshot.provider) : null;
    } catch {
        throw createCheckoutError("Delivery snapshot is invalid");
    }
    if (deliveryProvider === "INTERNAL") {
        if (shipment?.provider !== "INTERNAL") throw createCheckoutError("Internal delivery shipment is missing");
        if (shipment.state !== "READY_TO_SHIP") throw createCheckoutError("Internal delivery packing is not ready for completion");
        const [deliveredAssignment] = await tx.query<Array<{ id: number }>>(
            "SELECT id FROM delivery_assignments WHERE order_id = ? AND status = 'DELIVERED' ORDER BY id DESC LIMIT 1 FOR UPDATE",
            [orderId],
        );
        if (!deliveredAssignment) throw createCheckoutError("Internal delivery must be verified before completion");
    } else if ((order.delivery_snapshot && !shipment) || (shipment && shipment.state !== "DELIVERED")) {
        throw createCheckoutError("Historical delivery cannot be verified by the internal delivery workflow");
    }
    await tx.query("UPDATE orders SET status = 1, delivered_at = COALESCE(delivered_at, ?) WHERE id = ? AND status = 0", [deliveryAt, orderId]);
    if (payment.provider === "cash" && payment.status === "pending") await tx.query("UPDATE order_payments SET status = 'paid', paid_at = COALESCE(paid_at, ?), reconciliation_status = 'MANUAL_CONFIRMED', last_reconciled_at = UTC_TIMESTAMP(), provider_status = 'COLLECTED', updated_at = UTC_TIMESTAMP() WHERE id = ?", [deliveryAt, payment.id]);
    await tx.query("INSERT INTO order_status_events (order_id, status, label, note, actor_id, created_at) VALUES (?, 1, 'Done', 'Delivery confirmed', ?, UTC_TIMESTAMP())", [orderId, actor]);
    return true;
}
