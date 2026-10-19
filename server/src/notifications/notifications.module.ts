import { Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NestNotificationsService } from "./notifications.service";
import { NotificationsRepository } from "./notifications.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Module({
    imports: [NestConfigModule],
    controllers: [NotificationsController],
    providers: [AuthGuard, RolesGuard, NestNotificationsService, NotificationsRepository],
    exports: [NestNotificationsService],
})
export class NotificationsModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(NotificationsController);
    }
}
