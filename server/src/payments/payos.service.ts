import { Injectable } from "@nestjs/common";
import { NotFoundError, PayOS, type CreatePaymentLinkRequest, type Webhook, type WebhookData } from "@payos/node";
import { NestConfigService } from "../config/nest-config.service";
import { PAYMENT_CURRENCY, type PayOSPaymentLookup } from "./payment.types";

export type PayOSPaymentLinkResult = {
    orderCode: number;
    amount: number;
    currency: string;
    paymentLinkId: string;
    checkoutUrl: string;
    status: string;
    expiredAt?: number;
};

export type PayOSRecoverablePaymentLink = PayOSPaymentLookup & { checkoutUrl: string };

const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

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
        const link = await this.getClient().paymentRequests.create(input, {
            timeout: PROVIDER_REQUEST_TIMEOUT_MS,
            maxRetries: 0,
        });
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

    async getPaymentLink(identifier: { paymentLinkId?: string; orderCode?: number }): Promise<PayOSRecoverablePaymentLink> {
        if (identifier.orderCode === undefined && !identifier.paymentLinkId) {
            throw new Error("PayOS payment link identifier is required");
        }
        const link = identifier.orderCode !== undefined
            ? await this.getClient().paymentRequests.get(identifier.orderCode, { timeout: PROVIDER_REQUEST_TIMEOUT_MS, maxRetries: 0 })
            : await this.getClient().paymentRequests.get(identifier.paymentLinkId as string, { timeout: PROVIDER_REQUEST_TIMEOUT_MS, maxRetries: 0 });
        return {
            orderCode: link.orderCode,
            paymentLinkId: link.id,
            amount: link.amount,
            amountPaid: link.amountPaid,
            status: link.status,
            currency: PAYMENT_CURRENCY.VND,
            checkoutUrl: (link as typeof link & { checkoutUrl?: string }).checkoutUrl
                || `https://pay.payos.vn/web/${encodeURIComponent(link.id)}`,
        };
    }

    async findPaymentLinkByOrderCode(orderCode: number): Promise<PayOSRecoverablePaymentLink | null> {
        try {
            return await this.getPaymentLink({ orderCode });
        } catch (error) {
            if (error instanceof NotFoundError) return null;
            throw error;
        }
    }
    cancelPaymentLink(paymentLinkId: string, reason: string) {
        return this.getClient().paymentRequests.cancel(paymentLinkId, reason);
    }

    verifyWebhook(payload: unknown): Promise<WebhookData> {
        return this.getClient().webhooks.verify(payload as Webhook);
    }
}
