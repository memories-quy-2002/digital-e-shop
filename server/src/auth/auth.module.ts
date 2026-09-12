import { Global, Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestAuthController } from "./auth.controller";
import { NestAuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { createCsrfMiddleware } from "../middleware/csrf.middleware";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { UsersModule } from "../users/users.module";
import { VerifiedEmailGuard } from "../guards/verified-email.guard";

@Global()
@Module({
    imports: [UsersModule],
    controllers: [NestAuthController],
    providers: [
        NestAuthService,
        AuthRepository,
        AuthSessionService,
        FirebaseAdminAuthService,
        VerifiedEmailGuard,
    ],
    exports: [
        NestAuthService,
        AuthRepository,
        AuthSessionService,
        FirebaseAdminAuthService,
        VerifiedEmailGuard,
    ],
})
export class AuthModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(createRateLimitMiddleware(20)).forRoutes(NestAuthController);
        consumer.apply(createCsrfMiddleware()).exclude(
            "users/login",
            "users/register",
            "users/refresh",
            "orders/webhooks/stripe",
            "orders/webhooks/payos",
        ).forRoutes("*");
    }
}
