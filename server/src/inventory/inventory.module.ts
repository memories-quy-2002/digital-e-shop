import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { NestInventoryService } from "./inventory.service";
import { InventoryRepository } from "./inventory.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";

@Module({
    imports: [NestConfigModule],
    controllers: [InventoryController],
    providers: [NestInventoryService, InventoryRepository],
    exports: [NestInventoryService],
})
export class InventoryModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(InventoryController);
    }
}
