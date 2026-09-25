import { Injectable, Optional } from "@nestjs/common";
import { NestConfigService } from "../config/nest-config.service";
import { PayOSService } from "./payos.service";
import { PAYMENT_PROVIDER, PAYMENT_STATUS } from "./payment.types";
import { assertNewPaymentProvider } from "./payment.types";
import type { CreatePaymentInput, PaymentProviderResult, RefundPaymentInput } from "./payment.types";

@Injectable()
export class PaymentProviderService {
    constructor(
        private readonly config: NestConfigService,
        @Optional() private readonly payosService?: PayOSService,
    ) {}

    private get mode(): "mock" | "live" {
        return this.config.get("paymentProviderMode") === "live" ? "live" : "mock";
    }

    async createPayment(input: CreatePaymentInput): Promise<PaymentProviderResult> {
        const provider = assertNewPaymentProvider(input.provider);

        if (this.mode === "mock") {
            return {
                status: PAYMENT_STATUS.PENDING,
                providerReference: input.providerReference || `mock_${provider}_order_${input.orderId}`,
                simulated: true,
            };
        }

        if (provider === PAYMENT_PROVIDER.PAYOS) {
            if (!this.payosService?.isConfigured) {
                throw new Error("PayOS payments are not configured");
            }
            if (!input.providerPaymentId && !input.providerReference) {
                throw new Error("PayOS checkout must use a payment link");
            }
        }

        return {
            status: PAYMENT_STATUS.PENDING,
            providerReference: input.providerReference || input.providerPaymentId || `${provider}_order_${input.orderId}`,
            simulated: false,
        };
    }

    async refundPayment(input: RefundPaymentInput): Promise<PaymentProviderResult> {
        assertNewPaymentProvider(input.provider);

        if (this.mode === "mock") {
            return {
                status: PAYMENT_STATUS.REFUNDED,
                providerReference: input.paymentId,
                refundReference: `mock_refund_${input.provider}_order_${input.orderId}`,
                simulated: true,
            };
        }

        throw new Error(`${input.provider} refunds are not configured`);
    }
}
