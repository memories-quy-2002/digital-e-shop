import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "./payments.module";
import { PayOSWebhookController } from "./payosWebhook.controller";

@Module({
    imports: [OrdersModule, PaymentsModule],
    controllers: [PayOSWebhookController],
})
export class PayOSWebhookModule {}
