import { ConflictException } from "@nestjs/common";
import type { CarrierStatus } from "./shipping.types";

export type FulfillmentState = "UNFULFILLED" | "CONFIRMED" | "PICKING" | "PACKED" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERY_FAILED" | "RETURNING" | "RETURNED" | "DELIVERED" | "CANCELED";
export const nextFulfillmentStates: Record<FulfillmentState, FulfillmentState[]> = {
    UNFULFILLED: ["CONFIRMED", "CANCELED"], CONFIRMED: ["PICKING", "CANCELED"], PICKING: ["PACKED", "CANCELED"], PACKED: ["READY_TO_SHIP", "CANCELED"],
    READY_TO_SHIP: ["SHIPPED", "CANCELED"], SHIPPED: ["DELIVERY_FAILED", "RETURNING", "DELIVERED"], DELIVERY_FAILED: ["SHIPPED", "RETURNING", "DELIVERED"],
    RETURNING: ["RETURNED"], RETURNED: [], DELIVERED: [], CANCELED: [],
};
export function assertFulfillmentTransition(current: FulfillmentState, next: FulfillmentState) {
    if (!nextFulfillmentStates[current]?.includes(next)) throw new ConflictException("Fulfillment transition is not allowed");
}
export function assertCanShip(state: FulfillmentState, order: { status: number; currency: string; provider: string; paymentStatus: string; simulated: boolean }) {
    if (state !== "READY_TO_SHIP" || order.status !== 0 || order.currency !== "VND") throw new ConflictException("Order is not eligible for shipment");
    if (order.provider !== "cash" && (order.provider !== "payos" || order.simulated || order.paymentStatus !== "paid")) throw new ConflictException("Genuine paid PayOS payment is required before shipment");
}
export function carrierState(status: CarrierStatus): FulfillmentState | null {
    if (["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "SHIPPED";
    if (["DELIVERED", "DELIVERY_FAILED", "RETURNING", "RETURNED"].includes(status)) return status as FulfillmentState;
    return null;
}
