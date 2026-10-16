import { Module, type MiddlewareConsumer, type NestModule } from "@nestjs/common";
import { AuthGuard } from "../guards/auth.guard";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { LoyaltyController } from "./loyalty.controller";
import { LoyaltyRepository } from "./loyalty.repository";
import { LoyaltyService } from "./loyalty.service";

@Module({
    controllers: [LoyaltyController],
    providers: [AuthGuard, LoyaltyRepository, LoyaltyService],
    exports: [LoyaltyRepository, LoyaltyService],
})
export class LoyaltyModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createRateLimitMiddleware(60, { name: "loyalty", limit: 10, windowMs: 60_000 }))
            .forRoutes(LoyaltyController);
    }
}
