import { Injectable, ConflictException } from "@nestjs/common";
import { withTransaction } from "../database/transaction";
import { ShippingRepository } from "./shipping.repository";
import { assertFulfillmentTransition, type FulfillmentState } from "./fulfillment.policy";
import { OrderEmailService } from "../orders/order-email.service";

@Injectable()
export class FulfillmentService {
    constructor(private readonly repository: ShippingRepository, private readonly emails: OrderEmailService) {}
    transition(orderId: number, next: FulfillmentState, actorId: string) {
        return withTransaction(async (tx) => {
            const order = await this.repository.lockOrder(tx, orderId);
            const shipment = await this.repository.ensureShipment(tx, order);
            if (shipment.provider !== "INTERNAL") throw new ConflictException("Historical shipments are read-only");
            if (order.status !== 0 || !["CONFIRMED", "PICKING", "PACKED", "READY_TO_SHIP"].includes(next)) throw new ConflictException("Only packing states can be changed manually");
            if (shipment.state === next) return this.repository.summary(tx, orderId);
            assertFulfillmentTransition(shipment.state, next);
            await tx.query("UPDATE shipments SET state = ?, updated_at = UTC_TIMESTAMP(3) WHERE id = ?", [next, shipment.id]);
            const event = await this.repository.event(tx, shipment.id, next, actorId, "Packing status updated") as { insertId: number };
            await this.emails.emit(tx, orderId, "shipment", { key: `shipment:${shipment.id}:event:${event.insertId}`, status: next });
            return this.repository.summary(tx, orderId);
        });
    }
    summary(orderId: number) { return withTransaction((tx) => this.repository.summary(tx, orderId)); }
}
