import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ProductAlertsModule } from "../../product-alerts/product-alerts.module";
import { NestConfigModule } from "../../config/nest-config.module";
import { AuthGuard } from "../../guards/auth.guard";
import { RolesGuard } from "../../guards/roles.guard";
import { createRateLimitMiddleware } from "../../middleware/rate-limit.middleware";
import { InventoryModule } from "../inventory.module";
import { StockCountsController } from "./stock-counts.controller";
import { StockCountsRepository } from "./stock-counts.repository";
import { StockCountsService } from "./stock-counts.service";

@Module({
    imports: [NestConfigModule, ProductAlertsModule, InventoryModule],
    controllers: [StockCountsController],
    providers: [AuthGuard, RolesGuard, StockCountsService, StockCountsRepository],
})
export class StockCountsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(StockCountsController);
    }
}
