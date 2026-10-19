import { ConflictException } from "@nestjs/common";

export type FulfillmentState = "UNFULFILLED" | "CONFIRMED" | "PICKING" | "PACKED" | "READY_TO_SHIP" | "SHIPPED" | "DELIVERY_FAILED" | "RETURNING" | "RETURNED" | "DELIVERED" | "CANCELED";
export const nextFulfillmentStates: Record<FulfillmentState, FulfillmentState[]> = {
    UNFULFILLED: ["CONFIRMED"], CONFIRMED: ["PICKING"], PICKING: ["PACKED"], PACKED: ["READY_TO_SHIP"],
    READY_TO_SHIP: [], SHIPPED: [], DELIVERY_FAILED: [], RETURNING: [], RETURNED: [], DELIVERED: [], CANCELED: [],
};
export function assertFulfillmentTransition(current: FulfillmentState, next: FulfillmentState) {
    if (!nextFulfillmentStates[current]?.includes(next)) throw new ConflictException("Fulfillment transition is not allowed");
}
