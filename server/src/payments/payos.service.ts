import { Injectable } from "@nestjs/common";
import { PayOS, type CreatePaymentLinkRequest, type Webhook, type WebhookData } from "@payos/node";
import { NestConfigService } from "../config/nest-config.service";

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

    cancelPaymentLink(paymentLinkId: string, reason: string) {
        return this.getClient().paymentRequests.cancel(paymentLinkId, reason);
    }

    verifyWebhook(payload: unknown): Promise<WebhookData> {
        return this.getClient().webhooks.verify(payload as Webhook);
    }
}
