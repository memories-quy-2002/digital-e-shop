import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { ProductAlertsController } from "./product-alerts.controller";
import { ProductAlertsRepository } from "./product-alerts.repository";
import { ProductAlertsService } from "./product-alerts.service";

@Module({
    imports: [NestConfigModule],
    controllers: [ProductAlertsController],
    providers: [ProductAlertsService, ProductAlertsRepository],
    exports: [ProductAlertsService],
})
export class ProductAlertsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(ProductAlertsController);
    }
}
