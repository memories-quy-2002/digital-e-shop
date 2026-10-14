import { Body, Controller, HttpCode, HttpException, Optional, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import { NestOrdersService } from "./orders.service";
import { NestOrdersPayOSService } from "./orders.payos.service";
import type { GuestOrderLookupPayload, GuestPurchasePayload, GuestPayOSCheckoutPayload, GuestPayOSOrderLookupPayload } from "./orders.dto";
import { guestOrderLookupSchema, guestPurchaseSchema, guestPayOSCheckoutSchema, guestPayOSOrderLookupSchema } from "./orders.validator";

@Controller("orders")
export class GuestOrdersController {
    constructor(
        private readonly ordersService: NestOrdersService,
        @Optional() private readonly ordersPayOSService?: NestOrdersPayOSService,
    ) {}

    @Post("/guest/purchase")
    @HttpCode(HTTP_STATUS.CREATED)
    async makeGuestPurchase(
        @Body(new ZodValidationPipe(guestPurchaseSchema)) body: GuestPurchasePayload,
    ) {
        try {
            const result = await this.ordersService.makeGuestPurchase(body);
            return {
                orderId: result.order.id,
                order: result.order,
                guestOrderToken: result.guestOrderToken,
                paymentMethod: body.paymentMethod,
                msg: `Order has been created successfully with id = ${result.order.id}`,
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to place order right now" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async lookupGuestOrder(
        @Body(new ZodValidationPipe(guestOrderLookupSchema)) body: GuestOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.lookupGuestOrder(body.orderId, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }

    @Post("/guest/payos-checkout-session")
    @HttpCode(HTTP_STATUS.OK)
    async createGuestPayOSCheckoutSession(
        @Body(new ZodValidationPipe(guestPayOSCheckoutSchema)) body: GuestPayOSCheckoutPayload,
    ) {
        try {
            if (!this.ordersPayOSService) throw new HttpException({ msg: "PayOS checkout is not configured" }, HTTP_STATUS.SERVICE_UNAVAILABLE);
            const result = await this.ordersPayOSService.createGuestCheckoutSession(body);
            return {
                url: result.url,
                orderCode: result.orderCode,
                paymentLinkId: result.paymentLinkId,
                amount: result.amount,
                currency: result.currency,
                guestOrderToken: result.guestOrderToken,
                msg: "PayOS checkout session created",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number; details?: Record<string, unknown> };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                {
                    msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to start guest PayOS checkout" : error.message,
                    ...(statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? {} : error.details || {}),
                },
                statusCode,
            );
        }
    }

    @Post("/guest/by-payos-order-code")
    @HttpCode(HTTP_STATUS.OK)
    async getGuestOrderByPayOSOrderCode(
        @Body(new ZodValidationPipe(guestPayOSOrderLookupSchema)) body: GuestPayOSOrderLookupPayload,
    ) {
        try {
            const order = await this.ordersService.getGuestOrderByPayOSOrderCode(body.orderCode, body.guestOrderToken);
            return { order, msg: "Guest order retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            const error = err as Error & { statusCode?: number };
            const statusCode = error.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
            throw createHttpException(
                err,
                { msg: statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "Unable to retrieve guest order" : error.message },
                statusCode,
            );
        }
    }
}
