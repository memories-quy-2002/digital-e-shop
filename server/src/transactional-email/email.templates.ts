import type { EmailBusinessEvent, EmailMessage } from "./email.types";

const copy = {
    en: {
        welcome: "Welcome to Digital-E", payment: "Payment confirmed", placed: "Order received", shipment: "Shipment update", cancelled: "Order cancelled", afterSales: "After-sales update", refund: "Refund confirmed", recovery: "Restore guest order access", hi: "Hello", order: "Order", total: "Total", items: "Items", status: "Status", tracking: "Tracking code", expected: "Expected delivery", decision: "Decision", approved: "Approved", rejected: "Declined", refundAmount: "Refund amount", lookup: "For protected order details, use the order lookup on our website.", recoveryCode: "Verification code", recoveryExpiry: "This code expires in {minutes} minutes.",
        emailLabel: "DIGITAL-E · TRANSACTIONAL UPDATE", electronicsStore: "electronics store", orderIntro: "Thanks for shopping with Digital-E. We’ve received your order.", orderSummary: "Order summary", product: "Product", quantity: "Qty", subtotal: "Subtotal", discount: "Discount", delivery: "Delivery", recoveryIntro: "Use this one-time code to restore access to your guest order.",
    },
    vi: {
        welcome: "Ch\u00e0o m\u1eebng b\u1ea1n \u0111\u1ebfn v\u1edbi Digital-E", payment: "Thanh to\u00e1n th\u00e0nh c\u00f4ng", placed: "Đã nhận đơn hàng", shipment: "Cập nhật giao hàng", cancelled: "Đơn hàng đã hủy", afterSales: "Cập nhật yêu cầu hậu mãi", refund: "Đã xác nhận hoàn tiền", recovery: "Khôi phục quyền truy cập đơn hàng khách", hi: "Xin chào", order: "Đơn hàng", total: "Tổng thanh toán", items: "Sản phẩm", status: "Trạng thái", tracking: "Mã vận đơn", expected: "Dự kiến giao", decision: "Kết quả", approved: "Đã chấp thuận", rejected: "Chưa chấp thuận", refundAmount: "Số tiền hoàn", lookup: "Để xem thông tin đơn hàng cần bảo vệ, hãy dùng trang tra cứu đơn trên website.", recoveryCode: "Mã xác minh", recoveryExpiry: "Mã này sẽ hết hạn sau {minutes} phút.",
        emailLabel: "CẬP NHẬT GIAO DỊCH DIGITAL-E", electronicsStore: "Cửa hàng điện tử", orderIntro: "Cảm ơn bạn đã mua sắm tại Digital-E. Chúng tôi đã nhận được đơn hàng của bạn.", orderSummary: "Tóm tắt đơn hàng", product: "Sản phẩm", quantity: "SL", subtotal: "Tạm tính", discount: "Giảm giá", delivery: "Phí giao hàng", recoveryIntro: "Dùng mã một lần này để khôi phục quyền truy cập đơn hàng khách.",
    },
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
    if (!event || !["en", "vi"].includes(event.locale) || !["account_welcome", "order_placed", "payment_confirmed", "shipment_update", "order_cancelled", "after_sales_decision", "refund_confirmation", "guest_order_access_recovery"].includes(event.type)) {
        throw new Error("Invalid email event type or locale");
    }
    const eventKey = boundedText(event.eventKey, "event key", 191);
    if (!eventKey || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(event.recipient) || event.recipient.length > 254) throw new Error("Invalid email event identity or recipient");
    const base = { eventKey, recipient: event.recipient, locale: event.locale };
    if (event.type === "account_welcome") {
        return { ...base, type: event.type, snapshot: { customerName: boundedText(event.snapshot?.customerName, "customer name", 160) } };
    }
    if (event.type === "guest_order_access_recovery") {
        const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "guest_order_access_recovery" }>['snapshot'];
        if (!Number.isSafeInteger(snapshot.orderId) || snapshot.orderId <= 0 || !/^\d{6}$/.test(snapshot.code)
            || snapshot.expiresMinutes !== 10) throw new Error("Invalid guest order recovery email facts");
        return { ...base, type: event.type, snapshot: { customerName: boundedText(snapshot.customerName, "customer name", 160), orderId: snapshot.orderId, code: snapshot.code, expiresMinutes: snapshot.expiresMinutes } };
    }
    const orderNumber = boundedText(event.snapshot?.orderNumber, "order number", 100);
    const customerName = boundedText(event.snapshot?.customerName, "customer name", 160);
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
        case "payment_confirmed": {
            const snapshot = event.snapshot as Extract<EmailBusinessEvent, { type: "payment_confirmed" }>["snapshot"];
            return { ...base, type: event.type, snapshot: { orderNumber, customerName, amount: amountValue(snapshot.amount, "payment amount"), currency: "VND" } };
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
        case "account_welcome":
            return { title: t.welcome, lines: [event.snapshot.customerName] };
        case "order_placed":
            return { title: t.placed, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.items}: ${event.snapshot.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}`, `${t.total}: ${amount(event.snapshot.payableTotal, event.locale)}`, t.lookup] };
        case "payment_confirmed":
            return { title: t.payment, lines: [t.order + ": " + event.snapshot.orderNumber, t.total + ": " + amount(event.snapshot.amount, event.locale), t.lookup] };
        case "shipment_update":
            return { title: t.shipment, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.status}: ${event.snapshot.status}`, ...(event.snapshot.trackingCode ? [`${t.tracking}: ${event.snapshot.trackingCode}`] : []), ...(event.snapshot.expectedDelivery ? [`${t.expected}: ${event.snapshot.expectedDelivery}`] : []), t.lookup] };
        case "order_cancelled":
            return { title: t.cancelled, lines: [`${t.order}: ${event.snapshot.orderNumber}`, event.snapshot.reason, t.lookup] };
        case "after_sales_decision":
            return { title: t.afterSales, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.decision}: ${event.snapshot.decision === "approved" ? t.approved : t.rejected}`, event.snapshot.publicMessage, t.lookup] };
        case "refund_confirmation":
            return { title: t.refund, lines: [`${t.order}: ${event.snapshot.orderNumber}`, `${t.refundAmount}: ${amount(event.snapshot.refundAmount, event.locale)}`, t.lookup] };
        case "guest_order_access_recovery":
            return { title: t.recovery, lines: [`${t.order}: ${event.snapshot.orderId}`, `${t.recoveryCode}: ${event.snapshot.code}`, t.recoveryExpiry.replace("{minutes}", String(event.snapshot.expiresMinutes))] };
    }
}

function renderOrderPlacedHtml(event: Extract<EmailBusinessEvent, { type: "order_placed" }>): string {
    const t = copy[event.locale];
    const itemRows = event.snapshot.items.map((item) => `
        <tr>
            <td style="padding: 13px 12px; border-bottom: 1px solid #e8edef; color: #263239; font-size: 14px; line-height: 20px;">${escapeHtml(item.name)}</td>
            <td align="right" style="padding: 13px 12px; border-bottom: 1px solid #e8edef; color: #526169; font-size: 14px; white-space: nowrap;">× ${item.quantity}</td>
        </tr>`).join("");
    const discountRow = event.snapshot.merchandiseDiscount > 0 ? `
        <tr><td style="padding: 7px 0; color: #617078; font-size: 14px;">${escapeHtml(t.discount)}</td><td align="right" style="padding: 7px 0; color: #d45132; font-size: 14px;">−${amount(event.snapshot.merchandiseDiscount, event.locale)}</td></tr>` : "";

    return `
        <p style="margin: 0 0 10px; color: #526169; font-size: 15px; line-height: 23px;">${escapeHtml(t.orderIntro)}</p>
        <p style="margin: 0 0 22px; color: #263239; font-size: 15px; line-height: 23px;">${escapeHtml(t.hi)} ${escapeHtml(event.snapshot.customerName)},</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 26px; background-color: #f3f6f5; border-left: 4px solid #ec673f; border-radius: 8px;">
            <tr><td style="padding: 15px 18px 5px; color: #6b787d; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${escapeHtml(t.order)}</td></tr>
            <tr><td style="padding: 0 18px 16px; color: #1d292e; font-size: 20px; font-weight: 700; line-height: 27px;">${escapeHtml(event.snapshot.orderNumber)}</td></tr>
        </table>
        <h2 style="margin: 0 0 12px; color: #1d292e; font-size: 17px; line-height: 23px;">${escapeHtml(t.orderSummary)}</h2>
        <table aria-label="${escapeHtml(t.orderSummary)}" width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e4e9e9; border-radius: 8px; border-collapse: separate; overflow: hidden;">
            <thead><tr style="background-color: #f7f9f8;"><th align="left" scope="col" style="padding: 10px 12px; color: #6b787d; font-size: 11px; letter-spacing: .7px; text-transform: uppercase;">${escapeHtml(t.product)}</th><th align="right" scope="col" style="padding: 10px 12px; color: #6b787d; font-size: 11px; letter-spacing: .7px; text-transform: uppercase;">${escapeHtml(t.quantity)}</th></tr></thead>
            <tbody>${itemRows}</tbody>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px;">
            <tr><td style="padding: 7px 0; color: #617078; font-size: 14px;">${escapeHtml(t.subtotal)}</td><td align="right" style="padding: 7px 0; color: #263239; font-size: 14px;">${amount(event.snapshot.itemsSubtotal, event.locale)}</td></tr>
            ${discountRow}
            <tr><td style="padding: 7px 0; color: #617078; font-size: 14px;">${escapeHtml(t.delivery)}</td><td align="right" style="padding: 7px 0; color: #263239; font-size: 14px;">${amount(event.snapshot.shippingFee, event.locale)}</td></tr>
            <tr><td colspan="2" style="padding-top: 8px;"><div style="height: 1px; background-color: #e4e9e9; font-size: 1px; line-height: 1px;">&nbsp;</div></td></tr>
            <tr><td style="padding: 13px 0 2px; color: #1d292e; font-size: 15px; font-weight: 700;">${escapeHtml(t.total)}</td><td align="right" style="padding: 13px 0 2px; color: #d45132; font-size: 20px; font-weight: 700; white-space: nowrap;">${amount(event.snapshot.payableTotal, event.locale)}</td></tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 24px; background-color: #fff8f3; border-radius: 8px;">
            <tr><td style="padding: 14px 16px; color: #67574f; font-size: 13px; line-height: 20px;">${escapeHtml(t.lookup)}</td></tr>
        </table>`;
}

function renderEmailBodyHtml(event: EmailBusinessEvent, content: { title: string; lines: string[] }): string {
    if (event.type === "order_placed") return renderOrderPlacedHtml(event);

    const t = copy[event.locale];
    if (event.type === "guest_order_access_recovery") {
        return `
            <p style="margin: 0 0 10px; color: #526169; font-size: 15px; line-height: 23px;">${escapeHtml(t.hi)} ${escapeHtml(event.snapshot.customerName)},</p>
            <p style="margin: 0 0 22px; color: #526169; font-size: 14px; line-height: 22px;">${escapeHtml(t.recoveryIntro)}</p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 18px; background-color: #f3f6f5; border-left: 4px solid #b8d83e; border-radius: 8px;">
                <tr><td style="padding: 16px 18px 5px; color: #6b787d; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">${escapeHtml(t.order)} #${event.snapshot.orderId}</td></tr>
                <tr><td style="padding: 2px 18px 17px; color: #1d292e; font-family: 'Courier New', monospace; font-size: 27px; font-weight: 700; letter-spacing: 5px;">${escapeHtml(event.snapshot.code)}</td></tr>
            </table>
            <p style="margin: 0; color: #617078; font-size: 13px; line-height: 20px;">${escapeHtml(t.recoveryExpiry.replace("{minutes}", String(event.snapshot.expiresMinutes)))}</p>`;
    }

    const lines = event.type === "account_welcome" ? [] : content.lines;
    return `
        <p style="margin: 0 0 10px; color: #526169; font-size: 15px; line-height: 23px;">${escapeHtml(t.hi)} ${escapeHtml(event.snapshot.customerName)},</p>
        ${lines.map((line) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 10px; background-color: #f3f6f5; border-radius: 8px;"><tr><td style="padding: 13px 15px; color: #344249; font-size: 14px; line-height: 21px;">${escapeHtml(line)}</td></tr></table>`).join("")}`;
}

function renderEmailHtml(event: EmailBusinessEvent, content: { title: string; lines: string[] }): string {
    const t = copy[event.locale];
    return `<!doctype html>
<html lang="${event.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(content.title)}</title></head>
<body style="margin: 0; padding: 0; background-color: #eef2f2; color: #263239; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">${escapeHtml(content.title)} · Digital-E</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #eef2f2;">
        <tr><td align="center" style="padding: 32px 14px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: #ffffff; border: 1px solid #e1e7e7; border-radius: 12px; overflow: hidden;">
                <tr><td style="height: 4px; background-color: #ec673f; font-size: 1px; line-height: 1px;">&nbsp;</td></tr>
                <tr><td style="padding: 21px 28px; background-color: #1d292e;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                        <td width="46" valign="middle"><span style="display: block; width: 38px; height: 38px; background-color: #b8d83e; border-radius: 10px; color: #1d292e; font-size: 18px; font-weight: 800; line-height: 38px; text-align: center;">D.</span></td>
                        <td valign="middle"><span style="color: #ffffff; font-size: 16px; font-weight: 700; letter-spacing: .2px;">Digital-E</span><br><span style="color: #b7c2c5; font-size: 11px; letter-spacing: .4px;">${escapeHtml(t.electronicsStore)}</span></td>
                        <td align="right" valign="middle" style="color: #c4d75c; font-size: 10px; font-weight: 700; letter-spacing: .8px;">${escapeHtml(t.emailLabel)}</td>
                    </tr></table>
                </td></tr>
                <tr><td style="padding: 30px 32px 32px;">
                    <h1 style="margin: 0 0 22px; color: #1d292e; font-size: 27px; font-weight: 700; line-height: 34px;">${escapeHtml(content.title)}</h1>
                    ${renderEmailBodyHtml(event, content)}
                </td></tr>
                <tr><td style="padding: 17px 28px; background-color: #f7f9f8; border-top: 1px solid #e8edef; color: #728087; font-size: 12px; line-height: 18px;">Digital-E <span style="color: #c0c9cb;">·</span> ${escapeHtml(t.electronicsStore)}</td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}

export function renderEmail(event: EmailBusinessEvent): EmailMessage {
    event = sanitizeEmailEvent(event);
    const content = eventContent(event);
    const name = event.snapshot.customerName;
    const text = `${copy[event.locale].hi} ${name},\n\n${content.title}\n${content.lines.join("\n")}`;
    const html = renderEmailHtml(event, content);
    return { eventKey: event.eventKey, locale: event.locale, to: [event.recipient], subject: content.title, text, html };
}
