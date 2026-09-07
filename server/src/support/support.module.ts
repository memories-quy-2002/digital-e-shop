import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestConfigModule } from "../config/nest-config.module";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { SupportController } from "./support.controller";
import { SupportTicketRepository } from "./support.repository";
import { SupportTicketService } from "./support.service";

@Module({
    imports: [NestConfigModule],
    controllers: [SupportController],
    providers: [SupportTicketRepository, SupportTicketService],
    exports: [SupportTicketService],
})
export class SupportModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(60)).forRoutes(SupportController);
    }
}
