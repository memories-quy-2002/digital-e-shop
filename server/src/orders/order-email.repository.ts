import { Injectable } from "@nestjs/common";
import type { TransactionContext } from "../database/transaction";
import type { OrderIdentity } from "./orders.types";

export type OrderEmailFacts = { id: number; guest_email: string | null; guest_name: string | null; email: string | null; name: string | null; pricing_snapshot: string | object | null; contact_snapshot: string | object | null; total_price: number; discount: number; paid_amount: number | string | null };
@Injectable()
export class OrderEmailRepository {
    async snapshotPending(tx: TransactionContext, pendingId: number, identity: OrderIdentity, locale: "en" | "vi" = "en") {
        const [user] = identity.kind === "authenticated" ? await tx.query<Array<{ email: string; username: string }>>("SELECT email, username FROM users WHERE id = ?", [identity.userId]) : [];
        const contact = identity.kind === "guest" ? { email: identity.guestContact.guestEmail, name: identity.guestContact.guestName, locale } : { email: user?.email, name: user?.username || "Customer", locale };
        if (!contact.email) throw new Error("Checkout contact is missing");
        await tx.query("UPDATE pending_checkouts SET contact_snapshot = ? WHERE id = ?", [JSON.stringify(contact), pendingId]);
    }
    async facts(tx: TransactionContext, orderId: number) {
        const [order] = await tx.query<OrderEmailFacts[]>("SELECT o.id, o.guest_email, o.guest_name, o.pricing_snapshot, o.contact_snapshot, o.total_price, o.discount, u.email, u.username AS name, (SELECT op.amount FROM order_payments op WHERE op.order_id = o.id ORDER BY op.id DESC LIMIT 1) AS paid_amount FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?", [orderId]);
        return order;
    }
    async snapshotContact(tx: TransactionContext, orderId: number, locale: "en" | "vi" = "en") {
        const order = await this.facts(tx, orderId);
        if (!order || order.contact_snapshot) return;
        await tx.query("UPDATE orders SET contact_snapshot = ? WHERE id = ? AND contact_snapshot IS NULL", [JSON.stringify({ email: order.guest_email || order.email, name: order.guest_name || order.name || "Customer", locale }), orderId]);
    }
    items(tx: TransactionContext, orderId: number) {
        return tx.query<Array<{ name: string; quantity: number }>>("SELECT product_name_snapshot AS name, quantity FROM order_items WHERE order_id = ? ORDER BY id", [orderId]);
    }
}
