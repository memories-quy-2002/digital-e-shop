import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { NestConfigModule } from "./config/nest-config.module";
import { HealthModule } from "./health/health.module";
import { WishlistModule } from "./wishlist/wishlist.module";
import { AddressesModule } from "./addresses/addresses.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReviewsModule } from "./reviews/reviews.module";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";
import { InventoryModule } from "./inventory/inventory.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { CartModule } from "./cart/cart.module";
import { UsersModule } from "./users/users.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { BlobModule } from "./blob/blob.module";
import { AuthModule } from "./auth/auth.module";
import { StripeWebhookModule } from "./stripe/stripeWebhook.module";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { RequestLoggerInterceptor } from "./interceptors/request-logger.interceptor";

@Module({
    imports: [
        NestConfigModule,
        HealthModule,
        AuthModule,
        WishlistModule,
        AddressesModule,
        NotificationsModule,
        ReviewsModule,
        OrdersModule,
        ProductsModule,
        InventoryModule,
        PromotionsModule,
        CartModule,
        UsersModule,
        AnalyticsModule,
        BlobModule,
        StripeWebhookModule,
    ],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
    ],
})
export class AppModule {}
