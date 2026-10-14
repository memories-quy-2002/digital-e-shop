import { BadRequestException, Controller, Headers, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { EmailWebhookService } from "./email-webhook.service";

@Controller("email/webhooks/resend")
export class EmailWebhookController {
    constructor(private readonly webhook: EmailWebhookService) {}

    @Post()
    async receive(@Req() request: RawBodyRequest<Request>, @Headers() headers: Record<string, string | string[] | undefined>) {
        const rawBody = request.rawBody?.toString("utf8");
        if (typeof rawBody !== "string") throw new BadRequestException("Raw webhook body is required");
        return this.webhook.accept(rawBody, {
            id: singleHeader(headers["webhook-id"]),
            timestamp: singleHeader(headers["webhook-timestamp"]),
            signature: singleHeader(headers["webhook-signature"]),
        });
    }
}

function singleHeader(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] || "" : value || "";
}
