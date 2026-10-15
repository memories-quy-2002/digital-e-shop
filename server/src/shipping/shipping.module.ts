import { forwardRef, Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { UsersModule } from "../users/users.module";
import { ShippingQuoteRepository } from "./shipping-quote.repository";
import { ShippingQuoteService } from "./shipping-quote.service";
import { ShippingProviderRegistry } from "./shipping.registry";
import { ShippingController } from "./shipping.controller";
import { TasksModule } from "../operations/tasks.module";
import { InventoryModule } from "../inventory/inventory.module";
import { ProductAlertsModule } from "../product-alerts/product-alerts.module";
import { OrdersRepository } from "../orders/orders.repository";
import { NestOrdersCancellationService } from "../orders/orders-cancellation.service";
import { NestOrderTimelineService } from "../orders/orders.timeline.service";
import { OrderTimelineRepository } from "../orders/orders.timeline.repository";
import { ShippingRepository } from "./shipping.repository";
import { FulfillmentService } from "./fulfillment.service";
import { ShippingWebhookService } from "./shipping-webhook.service";
import { ShippingWebhookController } from "./shipping-webhook.controller";
import { AdminShippingController } from "./admin-shipping.controller";
import { FinancialOperationsModule } from "../operations/financial-operations.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { ProductsModule } from "../products/products.module";

@Module({
    imports: [CartModule, PromotionsModule, UsersModule, TasksModule, InventoryModule, ProductAlertsModule, forwardRef(() => FinancialOperationsModule), ProductsModule],
    controllers: [ShippingController, ShippingWebhookController, AdminShippingController],
    providers: [ShippingQuoteRepository, ShippingQuoteService, ShippingProviderRegistry, ShippingRepository, FulfillmentService, ShippingWebhookService, OrdersRepository, NestOrdersCancellationService, NestOrderTimelineService, OrderTimelineRepository],
    exports: [ShippingQuoteService, ShippingProviderRegistry, FulfillmentService, ShippingWebhookService],
})
export class ShippingModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(ShippingController, ShippingWebhookController, AdminShippingController);
    }
}
