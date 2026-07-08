import { Module } from "@nestjs/common";
import { StripeWebhookController } from "./stripeWebhook.controller";
import { OrdersModule } from "../orders/orders.module";

// No route-level express.raw() here: Nest's global body parser (registered
// in NestFactory.create, before any module middleware) always parses the
// body first. Raw-body capture for Stripe signature verification instead
// relies on the app-level `rawBody: true` bootstrap option (see main.ts),
// which stashes the buffer at req.rawBody without skipping JSON parsing.
@Module({
    imports: [OrdersModule],
    controllers: [StripeWebhookController],
})
export class StripeWebhookModule {}
