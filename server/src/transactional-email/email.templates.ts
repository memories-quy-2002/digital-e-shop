import type { EmailBusinessEvent, EmailMessage } from "./email.types";

const copy = {
    en: { placed: "Order received", shipment: "Shipment update", cancelled: "Order cancelled", afterSales: "After-sales update", refund: "Refund confirmed", hi: "Hello", order: "Order", total: "Total", items: "Items", status: "Status", tracking: "Tracking code", expected: "Expected delivery", decision: "Decision", approved: "Approved", rejected: "Declined", refundAmount: "Refund amount", lookup: "For protected order details, use the order lookup on our website." },
    vi: { placed: "Đã nhận đơn hàng", shipment: "Cập nhật giao hàng", cancelled: "Đơn hàng đã hủy", afterSales: "Cập nhật yêu cầu hậu mãi", refund: "Đã xác nhận hoàn tiền", hi: "Xin chào", order: "Đơn hàng", total: "Tổng thanh toán", items: "Sản phẩm", status: "Trạng thái", tracking: "Mã vận đơn", expected: "Dự kiến giao", decision: "Kết quả", approved: "Đã chấp thuận", rejected: "Chưa chấp thuận", refundAmount: "Số tiền hoàn", lookup: "Để xem thông tin đơn hàng cần bảo vệ, hãy dùng trang tra cứu đơn trên website." },
} as const;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function amount(value: number, locale: "en" | "vi"): string {
    return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { maximumFractionDigits: 0 }).format(value) + " VND";
}

function boundedText(value: unknown, label: string, max: number): string {
    if (typeof value !== "string" || value.length > max) throw new Error(`Invalid email ${label}`);
    return value;
}

function amountValue(value: unknown, label: string): number {
    if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`Invalid email ${label}`);
    return Number(value);
}

export function sanitizeEmailEvent(event: EmailBusinessEvent): EmailBusinessEvent {
    if (!event || !["en", "vi"].includes(event.locale) || !["order_placed", "shipment_update", "order_cancelled", "after_sales_decision", "refund_confirmation"].includes(event.type)) {
        throw new Error("Invalid email event type or locale");
    }
    const eventKey = boundedText(event.eventKey, "event key", 191);
    if (!eventKey || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(event.recipient) || event.recipient.length > 254) throw new Error("Invalid email event identity or recipient");
    const orderNumber = boundedText(event.snapshot?.orderNumber, "order number", 100);
    const customerName = boundedText(event.snapshot?.customerName, "customer name", 160);
    const base = { eventKey, recipient: event.recipient, locale: event.locale };
    switch (event.type) {
        case "order_placed": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "order_placed" }>['snapshot'];
            if (!Array.isArray(snapshot.items) || snapshot.items.length > 100) throw new Error("Invalid email item list");
            const items = snapshot.items.map((item) => ({ name: boundedText(item?.name, "item name", 160), quantity: amountValue(item?.quantity, "item quantity") })).map((item) => {
                if (item.quantity < 1) throw new Error("Invalid email item quantity");
                return item;
            });
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, items, itemsSubtotal: amountValue(snapshot.itemsSubtotal, "subtotal"), merchandiseDiscount: amountValue(snapshot.merchandiseDiscount, "discount"), shippingFee: amountValue(snapshot.shippingFee, "shipping fee"), payableTotal: amountValue(snapshot.payableTotal, "total"), currency: "VND" } };
        }
        case "shipment_update": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "shipment_update" }>['snapshot'];
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, status: boundedText(snapshot.status, "status", 100), ...(snapshot.trackingCode ? { trackingCode: boundedText(snapshot.trackingCode, "tracking code", 100) } : {}), ...(snapshot.expectedDelivery ? { expectedDelivery: boundedText(snapshot.expectedDelivery, "expected delivery", 100) } : {}) } };
        }
        case "order_cancelled": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "order_cancelled" }>['snapshot'];
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, reason: boundedText(snapshot.reason, "cancellation reason", 500) } };
        }
        case "after_sales_decision": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "after_sales_decision" }>['snapshot'];
            if (snapshot.decision !== "approved" && snapshot.decision !== "rejected") throw new Error("Invalid email after-sales decision");
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, decision: snapshot.decision, publicMessage: boundedText(snapshot.publicMessage, "public message", 1000) } };
        }
        case "refund_confirmation": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "refund_confirmation" }>['snapshot'];
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, refundAmount: amountValue(snapshot.refundAmount, "refund amount"), currency: "VND" } };
        }
    }
}

function eventContent(event: EmailBusinessEvent): { title: string; lines: string[] } {
    const t = copy[event.locale];
    switch (event.type) {
        case "order_placed":
            return { title: t.placed, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.items}: ${event.snapshot.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}`, `${t.total}: ${amount(event.snapshot.payableTotal, event.locale)}`, t.lookup] };
        case "shipment_update":
            return { title: t.shipment, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.status}: ${event.snapshot.status}`, ...(event.snapshot.trackingCode ? [`${t.tracking}: ${event.snapshot.trackingCode}`] : []), ...(event.snapshot.expectedDelivery ? [`${t.expected}: ${event.snapshot.expectedDelivery}`] : []), t.lookup] };
        case "order_cancelled":
            return { title: t.cancelled, lines: [`${t.order}: ${event.snapshot.orderNumber}`, event.snapshot.reason, t.lookup] };
        case "after_sales_decision":
            return { title: t.afterSales, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.decision}: ${event.snapshot.decision === "approved" ? t.approved : t.rejected}`, event.snapshot.publicMessage, t.lookup] };
        case "refund_confirmation":
            return { title: t.refund, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.refundAmount}: ${amount(event.snapshot.refundAmount, event.locale)}`, t.lookup] };
    }
}

export function renderEmail(event: EmailBusinessEvent): EmailMessage {
    event = sanitizeEmailEvent(event);
    const content = eventContent(event);
    const name = event.snapshot.customerName;
    const text = `${copy[event.locale].hi} ${name},\n\n${content.title}\n${content.lines.join("\n")}`;
    const html = `<!doctype html><html lang="${event.locale}"><body><main><h1>${escapeHtml(content.title)}</h1><p>${escapeHtml(copy[event.locale].hi)} ${escapeHtml(name)},</p><ul>${content.lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul></main></body></html>`;
    return { eventKey: event.eventKey, locale: event.locale, to: [event.recipient], subject: content.title, text, html };
}
