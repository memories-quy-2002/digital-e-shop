import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { NestAnalyticsService } from "./analytics.service";
import { AnalyticsRepository } from "./analytics.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";

@Module({
    imports: [NestConfigModule],
    controllers: [AnalyticsController],
    providers: [NestAnalyticsService, AnalyticsRepository],
})
export class AnalyticsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(AnalyticsController);
    }
}
