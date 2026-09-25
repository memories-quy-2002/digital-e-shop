import { Body, Controller, HttpCode, HttpException, Param, Post } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "#src/core/errors/http-exception";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesGuestCreateSchema, afterSalesGuestLookupSchema } from "./after-sales.validator";
import type { AfterSalesGuestCreateInput, AfterSalesListQuery } from "./after-sales.types";

const toHttpException = (error: unknown, fallbackMessage: string) => {
    if (error instanceof HttpException) return error;
    const typed = error as { statusCode?: number; message?: string };
    const statusCode = typed.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : typed.message || fallbackMessage;
    return createHttpException(error, { msg }, statusCode);
};

@Controller("orders/guest/after-sales")
export class AfterSalesGuestController {
    constructor(private readonly service: AfterSalesService) {}

    @Post("requests")
    @HttpCode(HTTP_STATUS.CREATED)
    async create(@Body(new ZodValidationPipe(afterSalesGuestCreateSchema)) body: AfterSalesGuestCreateInput) {
        try {
            const request = await this.service.createGuestRequest(body);
            return { request, msg: "Guest after-sales request created successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to create guest after-sales request");
        }
    }

    // POST keeps the bearer token out of URLs, access logs, browser history, and referrers.
    @Post("requests/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async list(@Body(new ZodValidationPipe(afterSalesGuestLookupSchema)) body: { orderId: number; guestOrderToken: string } & AfterSalesListQuery) {
        try {
            const { orderId, guestOrderToken, ...query } = body;
            return await this.service.listGuestRequests(orderId, guestOrderToken, query);
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve guest after-sales requests");
        }
    }

    @Post("requests/:id/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async detail(@Param("id") id: string, @Body(new ZodValidationPipe(afterSalesGuestLookupSchema.pick({ orderId: true, guestOrderToken: true }))) body: { orderId: number; guestOrderToken: string }) {
        try {
            const request = await this.service.getGuestRequest(body.orderId, body.guestOrderToken, Number(id));
            return { request, msg: "Guest after-sales request retrieved successfully" };
        } catch (error) {
            throw toHttpException(error, "Unable to retrieve guest after-sales request");
        }
    }
}
