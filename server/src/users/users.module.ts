import { Global, Module } from "@nestjs/common";
import type { MiddlewareConsumer, NestModule } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { NestUsersService } from "./users.service";
import { UsersRepository } from "./users.repository";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { NestConfigModule } from "../config/nest-config.module";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard } from "../guards/roles.guard";

@Global()
@Module({
    imports: [NestConfigModule],
    controllers: [UsersController],
    providers: [AuthGuard, RolesGuard, NestUsersService, UsersRepository],
    exports: [NestUsersService, UsersRepository],
})
export class UsersModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(createRateLimitMiddleware(100)).forRoutes(UsersController);
    }
}
