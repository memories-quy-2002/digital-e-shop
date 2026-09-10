import { Injectable, Optional } from "@nestjs/common";
import { NestConfigService } from "../config/nest-config.service";
import { PayOSService } from "./payos.service";
import { StripeService } from "../stripe/stripe.service";
import type { CreatePaymentInput, PaymentProviderResult, RefundPaymentInput } from "./payment.types";

@Injectable()
export class PaymentProviderService {
    constructor(
        private readonly config: NestConfigService,
        private readonly stripeService: StripeService,
        @Optional() private readonly payosService?: PayOSService,
    ) {}

    private get mode(): "mock" | "live" {
        return this.config.get("paymentProviderMode") === "live" ? "live" : "mock";
    }

    async createPayment(input: CreatePaymentInput): Promise<PaymentProviderResult> {
        if (this.mode === "mock") {
            return {
                status: "pending",
                providerReference: input.providerReference || `mock_${input.provider}_order_${input.orderId}`,
                simulated: true,
            };
        }

        if (input.provider === "stripe" && !this.config.get("stripeSecretKey")) {
            throw new Error("Stripe payments are not configured");
        }

        if (input.provider === "payos") {
            if (!this.payosService?.isConfigured) {
                throw new Error("PayOS payments are not configured");
            }
            if (!input.providerPaymentId && !input.providerReference) {
                throw new Error("PayOS checkout must use a payment link");
            }
        }

        return {
            status: "pending",
            providerReference: input.providerReference || input.providerPaymentId || `${input.provider}_order_${input.orderId}`,
            simulated: false,
        };
    }

    async refundPayment(input: RefundPaymentInput): Promise<PaymentProviderResult> {
        if (this.mode === "mock") {
            return {
                status: "refunded",
                providerReference: input.paymentId,
                refundReference: `mock_refund_${input.provider}_order_${input.orderId}`,
                simulated: true,
            };
        }

        if (input.provider === "stripe") {
            if (!this.config.get("stripeSecretKey")) {
                throw new Error("Stripe payments are not configured");
            }

            const refund = await this.stripeService.refundPayment(
                input.paymentId,
                undefined,
                `order-${input.orderId}-refund`,
            );
            return {
                status: "refunded",
                providerReference: input.paymentId,
                refundReference: refund.id,
                simulated: false,
            };
        }

        throw new Error(`${input.provider} refunds are not configured`);
    }
}
