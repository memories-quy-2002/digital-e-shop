import { Global, Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { UsersModule } from "../users/users.module";
import { MarketingController } from "./marketing.controller";
import { MarketingRepository } from "./marketing.repository";
import { MarketingService } from "./marketing.service";

@Global()
@Module({
    imports: [EmailModule, UsersModule],
    controllers: [MarketingController],
    providers: [MarketingRepository, MarketingService],
    exports: [MarketingRepository, MarketingService],
})
export class MarketingModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(30)).forRoutes(MarketingController);
    }
}
