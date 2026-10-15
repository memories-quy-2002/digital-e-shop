import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { ShippingWebhookService } from "./shipping-webhook.service";

@Controller("shipping/webhooks")
export class ShippingWebhookController {
    constructor(private readonly service: ShippingWebhookService) {}
    @Post("ghn") @HttpCode(200)
    accept(@Body() body: unknown, @Headers() headers: Record<string, string | string[] | undefined>) { return this.service.accept(body, headers); }
}
