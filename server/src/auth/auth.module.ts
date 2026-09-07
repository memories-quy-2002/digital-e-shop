import { Global, Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestAuthController } from "./auth.controller";
import { NestAuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { createCsrfMiddleware } from "../middleware/csrf.middleware";
import { UsersModule } from "../users/users.module";

@Global()
@Module({
    imports: [UsersModule],
    controllers: [NestAuthController],
    providers: [NestAuthService, AuthRepository, AuthSessionService, FirebaseAdminAuthService],
    exports: [NestAuthService, AuthRepository, AuthSessionService, FirebaseAdminAuthService],
})
export class AuthModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createCsrfMiddleware()).exclude(
            "users/login",
            "users/register",
            "users/refresh",
        ).forRoutes("*");
    }
}
