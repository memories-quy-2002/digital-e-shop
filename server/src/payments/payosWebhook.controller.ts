import { Controller, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { PayOSService } from "./payos.service";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

type PayOSWebhookPayload = {
    code?: string;
    success?: boolean;
    data?: {
        orderCode?: number;
        amount?: number;
        currency?: string;
        paymentLinkId?: string;
        code?: string;
    };
    signature?: string;
};

@Controller("orders/webhooks/payos")
export class PayOSWebhookController {
    constructor(
        private readonly payosService: PayOSService,
        private readonly reconciliationService: PaymentReconciliationService,
    ) {}

    @Post()
    async handlePayOSWebhook(
        @Req() req: Request,
        @Res() res: Response,
    ) {
        const requestId = requestIdFrom(req);
        const payload = req.body as PayOSWebhookPayload;
        let data;
        try {
            data = await this.payosService.verifyWebhook(payload);
        } catch (error) {
            logger.warn({ err: error, requestId }, "[payosWebhook] signature verification failed");
            return res.status(HttpStatus.BAD_REQUEST).json(buildErrorResponse({
                statusCode: HttpStatus.BAD_REQUEST,
                code: "PAYOS_SIGNATURE_INVALID",
                message: "Invalid PayOS webhook signature",
                requestId,
            }));
        }

        try {
            const outcome = await this.reconciliationService.handleVerifiedPayOSWebhook({
                envelope: { code: payload.code, success: payload.success },
                data: {
                    orderCode: data.orderCode,
                    amount: data.amount,
                    currency: data.currency,
                    paymentLinkId: data.paymentLinkId,
                    reference: data.reference,
                    transactionDateTime: data.transactionDateTime,
                    code: data.code,
                    status: data.code === "00" ? "PAID" : "FAILED",
                },
            });
            if (outcome.httpStatus >= HttpStatus.INTERNAL_SERVER_ERROR) {
                return res.status(outcome.httpStatus).json(buildErrorResponse({
                    statusCode: outcome.httpStatus,
                    code: "PAYOS_WEBHOOK_FAILED",
                    message: "Unable to process PayOS webhook",
                    details: { received: false },
                    requestId,
                }));
            }
            return res.status(outcome.httpStatus).json(buildSuccessResponse({
                received: true,
                finalized: outcome.kind === "processed",
                outcome: outcome.kind,
                ...(outcome.orderId === undefined ? {} : { orderId: outcome.orderId }),
            }, requestId));
        } catch (error) {
            logger.error({ err: error, requestId, orderCode: data.orderCode }, "[payosWebhook] handler error");
            const statusCode = Number((error as { statusCode?: number }).statusCode) || HttpStatus.INTERNAL_SERVER_ERROR;
            return res.status(statusCode).json(buildErrorResponse({
                statusCode,
                code: statusCode === HttpStatus.BAD_REQUEST ? "PAYOS_WEBHOOK_DATA_INVALID" : "PAYOS_WEBHOOK_FAILED",
                message: statusCode >= 500 ? "Unable to process PayOS webhook" : (error as Error).message,
                details: { received: false },
                requestId,
            }));
        }
    }
}
