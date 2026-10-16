import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { WishlistController } from "./wishlist.controller";
import { NestWishlistService } from "./wishlist.service";
import { WishlistRepository } from "./wishlist.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    imports: [NestConfigModule],
    controllers: [WishlistController],
    providers: [AuthGuard, RolesGuard, NestWishlistService, WishlistRepository],
})
export class WishlistModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(WishlistController);
    }
}
