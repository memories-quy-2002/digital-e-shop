import { Body, Controller, HttpCode, HttpException, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { AfterSalesService } from "./after-sales.service";
import { afterSalesGuestCreateSchema, afterSalesGuestLookupSchema } from "./after-sales.validator";
import type { AfterSalesGuestCreateInput, AfterSalesListQuery } from "./after-sales.types";

const toHttpException = (error: unknown) => {
    const typed = error as { statusCode?: number; message?: string };
    return new HttpException({ msg: typed.statusCode ? typed.message : "Unable to process guest after-sales request" }, typed.statusCode || 500);
};

@Controller("orders/guest/after-sales")
export class AfterSalesGuestController {
    constructor(private readonly service: AfterSalesService) {}

    @Post("requests")
    @HttpCode(201)
    async create(@Body(new ZodValidationPipe(afterSalesGuestCreateSchema)) body: AfterSalesGuestCreateInput) {
        try {
            const request = await this.service.createGuestRequest(body);
            return { request, msg: "Guest after-sales request created successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }

    // POST keeps the bearer token out of URLs, access logs, browser history, and referrers.
    @Post("requests/lookup")
    async list(@Body(new ZodValidationPipe(afterSalesGuestLookupSchema)) body: { orderId: number; guestOrderToken: string } & AfterSalesListQuery) {
        try {
            const { orderId, guestOrderToken, ...query } = body;
            return await this.service.listGuestRequests(orderId, guestOrderToken, query);
        } catch (error) {
            throw toHttpException(error);
        }
    }

    @Post("requests/:id/lookup")
    async detail(@Param("id") id: string, @Body(new ZodValidationPipe(afterSalesGuestLookupSchema.pick({ orderId: true, guestOrderToken: true }))) body: { orderId: number; guestOrderToken: string }) {
        try {
            const request = await this.service.getGuestRequest(body.orderId, body.guestOrderToken, Number(id));
            return { request, msg: "Guest after-sales request retrieved successfully" };
        } catch (error) {
            throw toHttpException(error);
        }
    }
}
