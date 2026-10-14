import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesGuestCreateSchema, afterSalesGuestLookupSchema } from "./after-sales.validator";
import type { AfterSalesGuestCreateInput, AfterSalesListQuery } from "./after-sales.types";

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
            throw mapToHttpException(error, "Unable to create guest after-sales request");
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
            throw mapToHttpException(error, "Unable to retrieve guest after-sales requests");
        }
    }

    @Post("requests/:id/lookup")
    @HttpCode(HTTP_STATUS.OK)
    async detail(@Param("id") id: string, @Body(new ZodValidationPipe(afterSalesGuestLookupSchema.pick({ orderId: true, guestOrderToken: true }))) body: { orderId: number; guestOrderToken: string }) {
        try {
            const request = await this.service.getGuestRequest(body.orderId, body.guestOrderToken, Number(id));
            return { request, msg: "Guest after-sales request retrieved successfully" };
        } catch (error) {
            throw mapToHttpException(error, "Unable to retrieve guest after-sales request");
        }
    }
}
