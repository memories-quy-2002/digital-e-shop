import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import { EmailService } from "../transactional-email/email.service";
import { OrderEmailRepository } from "./order-email.repository";
import { parseJson } from "../shipping/shipping-quote.service";
import type { PricingSnapshot } from "../shipping/shipping-quote.policy";
import type { OrderIdentity } from "./orders.types";

@Injectable()
export class OrderEmailService {
    constructor(private readonly repository: OrderEmailRepository, private readonly emails: EmailService) {}
    snapshotPending(tx: TransactionContext, pendingId: number, identity: OrderIdentity, locale?: "en" | "vi") { return this.repository.snapshotPending(tx, pendingId, identity, locale); }
    snapshotContact(tx: TransactionContext, orderId: number, locale: "en" | "vi" = "en") { return this.repository.snapshotContact(tx, orderId, locale); }
    async emitPaymentConfirmed(tx: TransactionContext, orderId: number) {
        const order = await this.repository.facts(tx, orderId);
        if (!order?.contact_snapshot) return;
        const contact = parseJson<{ email: string; name: string; locale: "en" | "vi" }>(order.contact_snapshot);
        if (!contact.email) throw new Error("Order contact snapshot is incomplete");
        if (order.paid_amount == null) throw new Error("Paid order amount is missing");
        const amount = Number(order.paid_amount);
        await this.emails.enqueue(tx, {
            eventKey: "order:" + orderId + ":payment-confirmed",
            type: "payment_confirmed",
            recipient: contact.email,
            locale: contact.locale,
            snapshot: { orderNumber: String(orderId), customerName: contact.name, amount, currency: "VND" },
        });
    }
    async emit(tx: TransactionContext, orderId: number, kind: "placed" | "canceled" | "shipment" | "decision", input: { key?: string; status?: string; trackingCode?: string; decision?: "approved" | "rejected" } = {}) {
        const order = await this.repository.facts(tx, orderId);
        if (!order?.contact_snapshot) return; // Historical contact is not retroactively invented.
        const contact = parseJson<{ email: string; name: string; locale: "en" | "vi" }>(order.contact_snapshot);
        if (!contact.email) throw new Error("Order contact snapshot is incomplete");
        const base = { recipient: contact.email, locale: contact.locale, eventKey: input.key || `order:${orderId}:${kind}` };
        const common = { orderNumber: String(orderId), customerName: contact.name };
        if (kind === "placed") {
            if (!order.pricing_snapshot) throw new Error("Order pricing snapshot is missing");
            const pricing = parseJson<PricingSnapshot>(order.pricing_snapshot);
            await this.emails.enqueue(tx, { ...base, type: "order_placed", snapshot: { ...common, ...pricing, items: await this.repository.items(tx, orderId) } });
        } else if (kind === "canceled") await this.emails.enqueue(tx, { ...base, type: "order_cancelled", snapshot: { ...common, reason: contact.locale === "vi" ? "Đơn hàng đã được hủy." : "Your order has been canceled." } });
        else if (kind === "shipment") await this.emails.enqueue(tx, { ...base, type: "shipment_update", snapshot: { ...common, status: input.status || "", ...(input.trackingCode ? { trackingCode: input.trackingCode } : {}) } });
        else await this.emails.enqueue(tx, { ...base, type: "after_sales_decision", snapshot: { ...common, decision: input.decision || "rejected", publicMessage: contact.locale === "vi" ? "Vui lòng xem yêu cầu hậu mãi để biết chi tiết." : "View your after-sales request for details." } });
    }
}
