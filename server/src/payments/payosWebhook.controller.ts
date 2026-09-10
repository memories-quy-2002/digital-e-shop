import { Controller, HttpStatus, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { NestOrdersPayOSService } from "../orders/orders.payos.service";
import { PayOSService } from "./payos.service";

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
        private readonly ordersPayOSService: NestOrdersPayOSService,
        private readonly payosService: PayOSService,
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

        if (payload.success !== true || payload.code !== "00" || data.code !== "00") {
            return res.status(HttpStatus.OK).json(buildSuccessResponse({ received: true, finalized: false }, requestId));
        }
        if (
            data.currency !== "VND"
            || !Number.isSafeInteger(Number(data.orderCode))
            || Number(data.orderCode) <= 0
            || !Number.isSafeInteger(Number(data.amount))
            || Number(data.amount) <= 0
            || !data.paymentLinkId
        ) {
            return res.status(HttpStatus.BAD_REQUEST).json(buildErrorResponse({
                statusCode: HttpStatus.BAD_REQUEST,
                code: "PAYOS_WEBHOOK_DATA_INVALID",
                message: "Invalid PayOS payment data",
                requestId,
            }));
        }

        try {
            await this.ordersPayOSService.handlePaymentWebhook(
                Number(data.orderCode),
                data.paymentLinkId,
                Number(data.amount),
            );
            return res.status(HttpStatus.OK).json(buildSuccessResponse({ received: true, finalized: true }, requestId));
        } catch (error) {
            logger.error({ err: error, requestId, orderCode: data.orderCode }, "[payosWebhook] handler error");
            const statusCode = Number((error as { statusCode?: number }).statusCode) || HttpStatus.INTERNAL_SERVER_ERROR;
            return res.status(statusCode).json(buildErrorResponse({
                statusCode,
                code: "PAYOS_WEBHOOK_FAILED",
                message: statusCode >= 500 ? "Unable to process PayOS webhook" : (error as Error).message,
                details: { received: false },
                requestId,
            }));
        }
    }
}
