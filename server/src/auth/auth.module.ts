import { Global, Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestAuthController } from "./auth.controller";
import { NestAuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { createCsrfMiddleware } from "../middleware/csrf.middleware";
import { UsersModule } from "../users/users.module";

@Global()
@Module({
    imports: [UsersModule],
    controllers: [NestAuthController],
    providers: [NestAuthService, AuthRepository, FirebaseAdminAuthService],
    exports: [NestAuthService, AuthRepository, FirebaseAdminAuthService],
})
export class AuthModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createCsrfMiddleware()).exclude(
            "api/users/login",
            "api/users/register",
            "api/users/refresh",
            "api/user/login",
            "api/user/register",
            "api/user/refresh",
            "user/login",
            "user/register",
            "user/refresh",
        ).forRoutes("*");
    }
}
