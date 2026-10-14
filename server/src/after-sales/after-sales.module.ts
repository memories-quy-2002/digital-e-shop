import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { PaymentsModule } from "../payments/payments.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { AdminAfterSalesController } from "./admin-after-sales.controller";
import { AfterSalesController } from "./after-sales.controller";
import { AfterSalesGuestController } from "./after-sales-guest.controller";
import { AfterSalesRepository } from "./after-sales.repository";
import { AfterSalesService } from "./after-sales.service";
import { FinancialOperationsModule } from "../operations/financial-operations.module";
import { ManualRefundService } from "./manual-refund.service";
import { ManualRefundRepository } from "./manual-refund.repository";

@Module({
    imports: [NestConfigModule, PaymentsModule, FinancialOperationsModule],
    controllers: [AfterSalesController, AfterSalesGuestController, AdminAfterSalesController],
    providers: [AfterSalesRepository, AfterSalesService, ManualRefundService, ManualRefundRepository],
    exports: [AfterSalesService],
})
export class AfterSalesModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(60)).forRoutes(AfterSalesController, AdminAfterSalesController);
        consumer.apply(createRateLimitMiddleware(30)).forRoutes(AfterSalesGuestController);
    }
}
