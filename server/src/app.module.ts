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
import { StockCountsModule } from "./inventory/stock-counts/stock-counts.module";
import { ProcurementModule } from "./procurement/procurement.module";
import { PromotionsModule } from "./promotions/promotions.module";
import { CartModule } from "./cart/cart.module";
import { UsersModule } from "./users/users.module";
import { AnalyticsModule } from "./analytics/analytics.module";
import { BlobModule } from "./blob/blob.module";
import { AuthModule } from "./auth/auth.module";
import { PayOSWebhookModule } from "./payments/payos-webhook.module";
import { AllExceptionsFilter } from "./filters/all-exceptions.filter";
import { RequestLoggerInterceptor } from "./interceptors/request-logger.interceptor";
import { SupportModule } from "./support/support.module";
import { AdminAlertsModule } from "./admin-alerts/admin-alerts.module";
import { AfterSalesModule } from "./after-sales/after-sales.module";
import { ProductAlertsModule } from "./product-alerts/product-alerts.module";
import { TelemetryShutdownProvider } from "./observability/telemetry-shutdown.provider";
import { TasksModule } from "./operations/tasks.module";
import { EmailModule } from "./transactional-email/email.module";
import type { EmailConfig } from "./transactional-email/email.types";
import { TaskRunnerModule } from "./operations/task-runner.module";
import { PAYOS_TASK_PROCESSOR } from "./operations/task-runner.service";
import { PayOSReconciliationTaskProcessor } from "./operations/payos-reconciliation-task.processor";
import { OrderEmailModule } from "./orders/order-email.module";
import { AdminAuditModule } from "./admin-audit/admin-audit.module";
import { LoyaltyModule } from "./loyalty/loyalty.module";

@Module({
    imports: [
        NestConfigModule,
        EmailModule.register({ mode: (process.env.EMAIL_PROVIDER_MODE || "disabled") as EmailConfig["mode"], production: process.env.NODE_ENV === "production", apiKey: process.env.RESEND_API_KEY, fromAddress: process.env.TRANSACTIONAL_EMAIL_FROM, webhookSecret: process.env.RESEND_WEBHOOK_SECRET, sandboxFixture: process.env.EMAIL_SANDBOX_FIXTURE as EmailConfig["sandboxFixture"] }),
        TaskRunnerModule.register({ imports: [OrdersModule], providers: [
            { provide: PAYOS_TASK_PROCESSOR, useExisting: PayOSReconciliationTaskProcessor },
        ] }),
        TasksModule,
        OrderEmailModule,
        HealthModule,
        AuthModule,
        WishlistModule,
        AddressesModule,
        NotificationsModule,
        ReviewsModule,
        OrdersModule,
        ProductsModule,
        InventoryModule,
        ProcurementModule,
        StockCountsModule,
        PromotionsModule,
        CartModule,
        UsersModule,
        AnalyticsModule,
        BlobModule,
        PayOSWebhookModule,
        SupportModule,
        AdminAlertsModule,
        AdminAuditModule,
        LoyaltyModule,
        AfterSalesModule,
        ProductAlertsModule,
    ],
    providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestLoggerInterceptor },
        TelemetryShutdownProvider,
    ],
})
export class AppModule {}
