import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { NestOrdersService } from "./orders.service";
import { NestOrdersStripeService } from "./orders.stripe.service";
import { NestOrdersPayOSService } from "./orders.payos.service";
import { OrdersRepository } from "./orders.repository";
import { NestOrderTimelineService } from "./orders.timeline.service";
import { OrderTimelineRepository } from "./orders.timeline.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { CartModule } from "../cart/cart.module";
import { InventoryModule } from "../inventory/inventory.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { StripeService } from "../stripe/stripe.service";
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { CheckoutReservationService } from "./checkout-reservation.service";
import { ProductsModule } from "../products/products.module";
import { PaymentsModule } from "../payments/payments.module";
import { EmailModule } from "../email/email.module";
import { UsersModule } from "../users/users.module";

@Module({
    imports: [NestConfigModule, CartModule, InventoryModule, NotificationsModule, PromotionsModule, ProductsModule, PaymentsModule, EmailModule, UsersModule],
    controllers: [OrdersController],
    providers: [
        NestOrdersService,
        NestOrdersStripeService,
        NestOrdersPayOSService,
        StripeService,
        CheckoutReservationRepository,
        CheckoutReservationService,
        OrdersRepository,
        NestOrderTimelineService,
        OrderTimelineRepository,
    ],
    exports: [NestOrdersService, NestOrdersStripeService, NestOrdersPayOSService, StripeService, CheckoutReservationService],
})
export class OrdersModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(OrdersController);
    }
}
