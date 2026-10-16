import { Module, RequestMethod } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { GuestOrdersController } from "./guest-orders.controller";
import { AdminPaymentsController } from "../payments/admin-payments.controller";
import { PaymentReconciliationRepository } from "../payments/payment-reconciliation.repository";
import { PaymentReconciliationService } from "../payments/payment-reconciliation.service";
import { NestOrdersService } from "./orders.service";
import { NestOrdersCancellationService } from "./orders-cancellation.service";
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
import { CheckoutReservationRepository } from "./checkout-reservation.repository";
import { CheckoutReservationService } from "./checkout-reservation.service";
import { ProductsModule } from "../products/products.module";
import { PaymentsModule } from "../payments/payments.module";
import { UsersModule } from "../users/users.module";
import { ProductAlertsModule } from "../product-alerts/product-alerts.module";
import { ShippingModule } from "../shipping/shipping.module";
import { CustomerShippingController } from "../shipping/customer-shipping.controller";
import { TasksModule } from "../operations/tasks.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { VerifiedEmailGuard } from "../guards/verified-email.guard";
import { LoyaltyModule } from "../loyalty/loyalty.module";

@Module({
    imports: [ShippingModule, NestConfigModule, CartModule, InventoryModule, NotificationsModule, PromotionsModule, ProductsModule, ProductAlertsModule, PaymentsModule, UsersModule, TasksModule, LoyaltyModule],
    controllers: [OrdersController, GuestOrdersController, AdminPaymentsController, CustomerShippingController],
    providers: [
        AuthGuard,
        RolesGuard,
        VerifiedEmailGuard,
        NestOrdersService,
        NestOrdersCancellationService,
        NestOrdersPayOSService,
        CheckoutReservationRepository,
        CheckoutReservationService,
        OrdersRepository,
        NestOrderTimelineService,
        PaymentReconciliationRepository,
        PaymentReconciliationService,
        OrderTimelineRepository,
    ],
    exports: [NestOrdersService, NestOrdersPayOSService, CheckoutReservationService, PaymentReconciliationService],
})
export class OrdersModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(OrdersController, GuestOrdersController, CustomerShippingController);
        consumer.apply(createRateLimitMiddleware(60, { name: "status", limit: 60, windowMs: 60_000 }))
            .forRoutes(
                { path: "orders/payment-attempts/:attemptId", method: RequestMethod.GET },
                { path: "orders/guest/payment-attempts/:attemptId/status", method: RequestMethod.POST },
            );
        consumer.apply(createRateLimitMiddleware(6, { name: "mutation", limit: 6, windowMs: 60_000 }))
            .forRoutes(
                { path: "orders/payment-attempts/:attemptId/reconcile", method: RequestMethod.POST },
                { path: "orders/payment-attempts/:attemptId/cancel", method: RequestMethod.POST },
                { path: "orders/guest/payment-attempts/:attemptId/reconcile", method: RequestMethod.POST },
                { path: "orders/guest/payment-attempts/:attemptId/cancel", method: RequestMethod.POST },
            );
    }
}
