import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { ReviewsController } from "./reviews.controller";
import { NestReviewsService } from "./reviews.service";
import { ReviewsRepository } from "./reviews.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";

@Module({
    imports: [NestConfigModule],
    controllers: [ReviewsController],
    providers: [NestReviewsService, ReviewsRepository],
})
export class ReviewsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(ReviewsController);
    }
}
