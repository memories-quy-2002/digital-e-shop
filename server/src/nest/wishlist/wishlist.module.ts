import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { WishlistController } from "./wishlist.controller";
import { NestWishlistService } from "./wishlist.service";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";

@Module({
    imports: [NestConfigModule],
    controllers: [WishlistController],
    providers: [NestWishlistService],
})
export class WishlistModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(WishlistController);
    }
}
