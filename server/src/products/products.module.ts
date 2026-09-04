import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { NestProductsService } from "./products.service";
import { NestProductsRepository } from "./products.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { InventoryModule } from "../inventory/inventory.module";

@Module({
    imports: [NestConfigModule, InventoryModule],
    controllers: [ProductsController],
    providers: [NestProductsService, NestProductsRepository],
    exports: [NestProductsRepository, NestProductsService],
})
export class ProductsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100000)).forRoutes(ProductsController);
    }
}
