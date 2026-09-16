import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module";
import { PaymentsModule } from "./payments.module";
import { PayOSWebhookController } from "./payosWebhook.controller";
import { PaymentReconciliationService } from "./payment-reconciliation.service";

@Module({
    imports: [OrdersModule, PaymentsModule],
    controllers: [PayOSWebhookController],
    providers: [PaymentReconciliationService],
})
export class PayOSWebhookModule {}
