import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { CartController } from "./cart.controller";
import { NestCartService } from "./cart.service";
import { CartRepository } from "./cart.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { ProductsModule } from "../products/products.module";
import { PromotionsModule } from "../promotions/promotions.module";

@Module({
    imports: [NestConfigModule, ProductsModule, PromotionsModule],
    controllers: [CartController],
    providers: [NestCartService, CartRepository],
    exports: [NestCartService],
})
export class CartModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(CartController);
    }
}
