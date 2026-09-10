import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";
import { formatPaymentAmount } from "../payments/currency";

export type OrderConfirmationInput = {
    orderId: number;
    email: string;
    name: string;
    total: number;
    paymentMethod: string;
    shipping: {
        address: string;
        city: string;
        country: string;
    };
    items: Array<{
        name: string;
        quantity: number;
        total: number;
    }>;
    customerType: "guest" | "authenticated";
    emailVerified?: boolean;
};

export type EmailVerificationInput = {
    userId: string;
    email: string;
    name?: string | null;
    token: string;
    tokenHash: string;
};

export type PasswordResetInput = {
    userId: string;
    email: string;
    name?: string | null;
    resetUrl: string;
    tokenHash: string;
    emailVerified: boolean;
};

export type EmailChangeConfirmationInput = {
    userId: string;
    email: string;
    name?: string | null;
    confirmUrl: string;
    tokenHash: string;
};

export type EmailChangeNoticeInput = {
    userId: string;
    email: string;
    name?: string | null;
    newEmail: string;
    event: "requested" | "changed";
    emailVerified: boolean;
};

export type MarketingWelcomeInput = {
    subscriptionId: number;
    email: string;
    unsubscribeUrl: string;
    tokenHash: string;
    emailVerified: boolean;
};

const recipientEmailSchema = z.string().trim().max(255).email();

const escapeHtml = (value: unknown): string => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatCurrency = (value: number): string => formatPaymentAmount(Number(value || 0), env.storeCurrency);

const paymentLabel = (paymentMethod: string): string => {
    if (paymentMethod === "cash") return "Cash on delivery";
    if (paymentMethod === "bank_transfer") return "Bank transfer";
    if (paymentMethod === "payos") return "PayOS";
    if (paymentMethod === "card" || paymentMethod === "stripe") return "Card";
    return paymentMethod || "Pending";
};

const buildEmailContent = (input: OrderConfirmationInput) => {
    const orderTitle = `Order #${input.orderId}`;
    const total = formatCurrency(input.total);
    const payment = paymentLabel(input.paymentMethod);
    const shipping = `${input.shipping.address}, ${input.shipping.city}, ${input.shipping.country}`;
    const clientBaseUrl = (env.clientUrl || "http://localhost:5173").replace(/\/+$/, "");
    const lookupUrl = `${clientBaseUrl}${input.customerType === "guest" ? "/guest-order" : "/orders"}`;
    const lookupInstructions = input.customerType === "guest"
        ? `Track your guest order at ${lookupUrl} using the Order ID and access token shown on the checkout confirmation page.`
        : `View your order at ${lookupUrl} after signing in to your Digital-E account.`;
    const htmlLookupInstructions = input.customerType === "guest"
        ? "Use the Order ID and access token shown on the checkout confirmation page to track this guest order."
        : "Sign in to your Digital-E account to view this order and its status.";
    const itemRows = input.items.map((item) => `
        <tr>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.name)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.quantity)}</td>
            <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatCurrency(item.total))}</td>
        </tr>`).join("");

    return {
        subject: `${orderTitle} confirmed | Digital-E`,
        text: [
            `Hi ${input.name},`,
            "",
            `Your Digital-E order ${orderTitle} has been received successfully.`,
            `Total: ${total}`,
            `Payment: ${payment}`,
            `Shipping to: ${shipping}`,
            "",
            "Items:",
            ...input.items.map((item) => `- ${item.name} x${item.quantity}: ${formatCurrency(item.total)}`),
            "",
            lookupInstructions,
            "",
            "Thank you for shopping with Digital-E.",
        ].join("\n"),
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
                <h1 style="margin-bottom:8px;">${escapeHtml(orderTitle)} confirmed</h1>
                <p>Hi ${escapeHtml(input.name)}, your Digital-E order has been received successfully.</p>
                <p><strong>Total:</strong> ${escapeHtml(total)}<br><strong>Payment:</strong> ${escapeHtml(payment)}<br><strong>Shipping to:</strong> ${escapeHtml(shipping)}</p>
                <h2 style="font-size:18px;margin-top:24px;">Items</h2>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr>
                            <th style="padding:8px 0;text-align:left;border-bottom:2px solid #111827;">Product</th>
                            <th style="padding:8px 0;text-align:center;border-bottom:2px solid #111827;">Qty</th>
                            <th style="padding:8px 0;text-align:right;border-bottom:2px solid #111827;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
                <p style="margin-top:24px;">${escapeHtml(htmlLookupInstructions)}</p>
                <p><a href="${escapeHtml(lookupUrl)}">Open order details</a></p>
            </div>`,
    };
};

@Injectable()
export class ResendEmailService {
    async sendEmailVerification(input: EmailVerificationInput): Promise<boolean> {
        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return false;

        const clientBaseUrl = (env.clientUrl || "http://localhost:5173").replace(/\/+$/, "");
        const verificationUrl = `${clientBaseUrl}/verify-email?token=${encodeURIComponent(input.token)}`;
        const displayName = input.name?.trim() || "there";
        const subject = "Verify your Digital-E email address";
        const text = [
            `Hi ${displayName},`,
            "",
            "Please verify your Digital-E email address to unlock checkout and product reviews.",
            `Verify your email: ${verificationUrl}`,
            "",
            "This link expires in 24 hours. If you did not create this account, you can ignore this email.",
        ].join("\n");
        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
                <h1>Verify your Digital-E email</h1>
                <p>Hi ${escapeHtml(displayName)},</p>
                <p>Please verify your email address to unlock checkout and product reviews.</p>
                <p><a href="${escapeHtml(verificationUrl)}">Verify email address</a></p>
                <p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>
            </div>`;
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.resendApiKey.trim()}`,
                "Content-Type": "application/json",
                "User-Agent": "digital-e-server/1.0",
                "Idempotency-Key": `email-verification-${input.userId}-${input.tokenHash.slice(0, 16)}`,
            },
            body: JSON.stringify({
                from: env.resendFromEmail,
                to: [parsedEmail.data.toLowerCase()],
                subject,
                html,
                text,
            }),
        });

        if (!response.ok) {
            logger.error({ userId: input.userId, status: response.status }, "[ResendEmailService] verification delivery failed");
            throw new Error(`Resend email delivery failed (${response.status})`);
        }

        return true;
    }

    async sendOrderConfirmation(input: OrderConfirmationInput): Promise<void> {
        if (input.customerType === "authenticated" && input.emailVerified !== true) return;

        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success) return;

        const apiKey = env.resendApiKey.trim();
        if (!apiKey) return;

        const content = buildEmailContent(input);
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                "User-Agent": "digital-e-server/1.0",
                "Idempotency-Key": `order-confirmation-${input.orderId}`,
            },
            body: JSON.stringify({
                from: env.resendFromEmail,
                to: [parsedEmail.data.toLowerCase()],
                subject: content.subject,
                html: content.html,
                text: content.text,
            }),
        });

        if (!response.ok) {
            logger.error({ orderId: input.orderId, status: response.status }, "[ResendEmailService] delivery failed");
            throw new Error(`Resend email delivery failed (${response.status})`);
        }
    }

    async sendPasswordReset(input: PasswordResetInput): Promise<void> {
        if (!input.emailVerified) return;

        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return;

        const displayName = input.name?.trim() || "there";
        const subject = "Reset your Digital-E password";
        const text = [
            `Hi ${displayName},`,
            "",
            "We received a request to reset your Digital-E password.",
            `Reset your password: ${input.resetUrl}`,
            "",
            "This link expires in one hour. If you did not request this, you can ignore this email.",
        ].join("\n");
        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
                <h1>Reset your Digital-E password</h1>
                <p>Hi ${escapeHtml(displayName)},</p>
                <p>We received a request to reset your password.</p>
                <p><a href="${escapeHtml(input.resetUrl)}">Reset your password</a></p>
                <p>This link expires in one hour. If you did not request this, you can ignore this email.</p>
            </div>`;

        await this.sendMessage({
            email: parsedEmail.data,
            subject,
            text,
            html,
            idempotencyKey: `password-reset-${input.userId}-${input.tokenHash.slice(0, 16)}`,
            logContext: { userId: input.userId },
            logMessage: "[ResendEmailService] password reset delivery failed",
        });
    }

    async sendPasswordChangedNotice(input: { userId: string; email: string; name?: string | null; emailVerified: boolean }): Promise<void> {
        if (!input.emailVerified) return;

        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return;

        const displayName = input.name?.trim() || "there";
        const subject = "Your Digital-E password was changed";
        const text = [
            `Hi ${displayName},`,
            "",
            "Your Digital-E password was changed successfully.",
            "If you did not make this change, contact support immediately.",
        ].join("\n");
        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
                <h1>Your password was changed</h1>
                <p>Hi ${escapeHtml(displayName)}, your Digital-E password was changed successfully.</p>
                <p>If you did not make this change, contact support immediately.</p>
            </div>`;

        await this.sendMessage({
            email: parsedEmail.data,
            subject,
            text,
            html,
            idempotencyKey: `password-changed-${input.userId}-${Date.now()}`,
            logContext: { userId: input.userId },
            logMessage: "[ResendEmailService] password changed notice delivery failed",
        });
    }

    async sendEmailChangeConfirmation(input: EmailChangeConfirmationInput): Promise<void> {
        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return;

        const displayName = input.name?.trim() || "there";
        const subject = "Confirm your new Digital-E email";
        const text = [
            `Hi ${displayName},`,
            "",
            "Confirm this email address to finish changing the email on your Digital-E account.",
            `Confirm email: ${input.confirmUrl}`,
            "",
            "This link expires in one hour. If you did not request this change, ignore this email and review your account security.",
        ].join("\n");
        const html = `
            <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
                <h1>Confirm your new email</h1>
                <p>Hi ${escapeHtml(displayName)},</p>
                <p>Confirm this email address to finish changing your Digital-E account email.</p>
                <p><a href="${escapeHtml(input.confirmUrl)}">Confirm new email</a></p>
                <p>This link expires in one hour. If you did not request this change, ignore this email and review your account security.</p>
            </div>`;

        await this.sendMessage({
            email: parsedEmail.data,
            subject,
            text,
            html,
            idempotencyKey: `email-change-confirmation-${input.userId}-${input.tokenHash.slice(0, 16)}`,
            logContext: { userId: input.userId },
            logMessage: "[ResendEmailService] email-change confirmation delivery failed",
        });
    }

    async sendEmailChangeNotice(input: EmailChangeNoticeInput): Promise<void> {
        if (!input.emailVerified) return;

        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return;

        const displayName = input.name?.trim() || "there";
        const subject = input.event === "requested"
            ? "Email change requested for your Digital-E account"
            : "Your Digital-E email was changed";
        const changeMessage = input.event === "requested"
            ? `A request was made to change your Digital-E email to ${input.newEmail}.`
            : `Your Digital-E email was changed to ${input.newEmail}.`;
        const text = [
            `Hi ${displayName},`,
            "",
            changeMessage,
            "If you did not request or make this change, contact support immediately.",
        ].join("\n");
        const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
            <h1>${escapeHtml(subject)}</h1>
            <p>Hi ${escapeHtml(displayName)},</p>
            <p>${escapeHtml(changeMessage)}</p>
            <p>If you did not request or make this change, contact support immediately.</p>
        </div>`;

        await this.sendMessage({
            email: parsedEmail.data,
            subject,
            text,
            html,
            idempotencyKey: `email-change-notice-${input.userId}-${input.event}-${parsedEmail.data}`,
            logContext: { userId: input.userId },
            logMessage: "[ResendEmailService] email-change notice delivery failed",
        });
    }

    async sendMarketingWelcome(input: MarketingWelcomeInput): Promise<void> {
        if (!input.emailVerified) return;

        const parsedEmail = recipientEmailSchema.safeParse(input.email);
        if (!parsedEmail.success || !env.resendApiKey.trim()) return;

        const subject = "You are subscribed to Digital-E updates";
        const text = [
            "You are now subscribed to Digital-E product highlights, guides, and limited promotions.",
            "",
            `Unsubscribe: ${input.unsubscribeUrl}`,
        ].join("\n");
        const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;">
            <h1>Welcome to Digital-E updates</h1>
            <p>You are now subscribed to product highlights, guides, and limited promotions.</p>
            <p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe from marketing emails</a></p>
        </div>`;

        await this.sendMessage({
            email: parsedEmail.data,
            subject,
            text,
            html,
            idempotencyKey: `marketing-welcome-${input.subscriptionId}-${input.tokenHash.slice(0, 16)}`,
            logContext: { subscriptionId: input.subscriptionId },
            logMessage: "[ResendEmailService] marketing welcome delivery failed",
        });
    }

    private async sendMessage(input: {
        email: string;
        subject: string;
        text: string;
        html: string;
        idempotencyKey: string;
        logContext: Record<string, unknown>;
        logMessage: string;
    }): Promise<void> {
        const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.resendApiKey.trim()}`,
                "Content-Type": "application/json",
                "User-Agent": "digital-e-server/1.0",
                "Idempotency-Key": input.idempotencyKey,
            },
            body: JSON.stringify({
                from: env.resendFromEmail,
                to: [input.email.toLowerCase()],
                subject: input.subject,
                html: input.html,
                text: input.text,
            }),
        });

        if (!response.ok) {
            logger.error({ ...input.logContext, status: response.status }, input.logMessage);
            throw new Error(`Resend email delivery failed (${response.status})`);
        }
    }
}
