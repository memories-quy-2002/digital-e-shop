import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller";
import { NestReviewsService } from "./reviews.service";
import { ReviewsRepository } from "./reviews.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";
import { VerifiedEmailGuard } from "../guards/verified-email.guard";

@Module({
    imports: [NestConfigModule],
    controllers: [ReviewsController],
    providers: [AuthGuard, RolesGuard, VerifiedEmailGuard, NestReviewsService, ReviewsRepository],
})
export class ReviewsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(ReviewsController);
    }
}
