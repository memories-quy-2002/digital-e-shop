import { Injectable } from "@nestjs/common";
import { PayOS, type CreatePaymentLinkRequest, type Webhook, type WebhookData } from "@payos/node";
import { NestConfigService } from "../config/nest-config.service";
import type { PayOSPaymentLookup } from "./payment.types";

export type PayOSPaymentLinkResult = {
    orderCode: number;
    amount: number;
    currency: string;
    paymentLinkId: string;
    checkoutUrl: string;
    status: string;
    expiredAt?: number;
};

@Injectable()
export class PayOSService {
    private client: PayOS | null = null;

    constructor(private readonly config: NestConfigService) {}

    get isConfigured(): boolean {
        return Boolean(
            this.config.get("payosClientId")
            && this.config.get("payosApiKey")
            && this.config.get("payosChecksumKey"),
        );
    }

    private getClient(): PayOS {
        if (this.client) return this.client;
        if (!this.isConfigured) {
            throw new Error("PayOS payments are not configured");
        }

        this.client = new PayOS({
            clientId: this.config.get("payosClientId"),
            apiKey: this.config.get("payosApiKey"),
            checksumKey: this.config.get("payosChecksumKey"),
            partnerCode: this.config.get("payosPartnerCode") || undefined,
            baseURL: this.config.get("payosBaseUrl") || undefined,
        });
        return this.client;
    }

    async createPaymentLink(input: CreatePaymentLinkRequest): Promise<PayOSPaymentLinkResult> {
        const link = await this.getClient().paymentRequests.create(input);
        return {
            orderCode: link.orderCode,
            amount: link.amount,
            currency: link.currency,
            paymentLinkId: link.paymentLinkId,
            checkoutUrl: link.checkoutUrl,
            status: link.status,
            expiredAt: link.expiredAt,
        };
    }

    async getPaymentLink(identifier: { paymentLinkId?: string; orderCode?: number }): Promise<PayOSPaymentLookup> {
        if (identifier.orderCode === undefined && !identifier.paymentLinkId) {
            throw new Error("PayOS payment link identifier is required");
        }
        const link = identifier.orderCode !== undefined
            ? await this.getClient().paymentRequests.get(identifier.orderCode)
            : await this.getClient().paymentRequests.get(identifier.paymentLinkId as string);
        return {
            orderCode: link.orderCode,
            paymentLinkId: link.id,
            amount: link.amount,
            amountPaid: link.amountPaid,
            status: link.status,
            currency: "VND",
        };
    }
    cancelPaymentLink(paymentLinkId: string, reason: string) {
        return this.getClient().paymentRequests.cancel(paymentLinkId, reason);
    }

    verifyWebhook(payload: unknown): Promise<WebhookData> {
        return this.getClient().webhooks.verify(payload as Webhook);
    }
}
