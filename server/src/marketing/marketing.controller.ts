import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { buildSuccessResponse, requestIdFrom } from "#src/shared/http/api-response";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { MarketingService } from "./marketing.service";
import { marketingSubscribeSchema, marketingUnsubscribeSchema } from "./marketing.validator";

@Controller("marketing")
export class MarketingController {
    constructor(private readonly marketingService: MarketingService) {}

    @Post("subscribe")
    @HttpCode(HttpStatus.ACCEPTED)
    async subscribe(
        @Body(new ZodValidationPipe(marketingSubscribeSchema)) body: { email: string; source?: string },
        @Req() req: Request,
    ) {
        await this.marketingService.subscribe(body.email, body.source);
        return buildSuccessResponse({ subscribed: true, msg: "Marketing subscription is active" }, requestIdFrom(req));
    }

    @Post("unsubscribe")
    @HttpCode(HttpStatus.OK)
    async unsubscribe(
        @Body(new ZodValidationPipe(marketingUnsubscribeSchema)) body: { token: string },
        @Req() req: Request,
    ) {
        const result = await this.marketingService.unsubscribe(body.token);
        return buildSuccessResponse({ ...result, msg: "You have been unsubscribed from marketing emails" }, requestIdFrom(req));
    }
}
