import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { PromotionsController } from "./promotions.controller";
import { NestPromotionsService } from "./promotions.service";
import { PromotionsRepository } from "./promotions.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    imports: [NestConfigModule],
    controllers: [PromotionsController],
    providers: [AuthGuard, RolesGuard, NestPromotionsService, PromotionsRepository],
    exports: [PromotionsRepository],
})
export class PromotionsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(PromotionsController);
    }
}
