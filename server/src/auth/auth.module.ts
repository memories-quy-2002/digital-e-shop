import { Global, Module, MiddlewareConsumer, NestModule } from "@nestjs/common";
import { NestAuthController } from "./auth.controller";
import { NestAuthService } from "./auth.service";
import { AuthRepository } from "./auth.repository";
import { AuthSessionService } from "./auth-session.service";
import { FirebaseAdminAuthService } from "./firebase-admin.service";
import { createCsrfMiddleware } from "../middleware/csrf.middleware";
import { createRateLimitMiddleware } from "../middleware/rate-limit.middleware";
import { UsersModule } from "../users/users.module";
import { EmailModule } from "../email/email.module";
import { EmailVerificationService } from "./email-verification.service";
import { VerifiedEmailGuard } from "../guards/verified-email.guard";
import { PasswordResetService } from "./password-reset.service";
import { EmailChangeService } from "./email-change.service";

@Global()
@Module({
    imports: [UsersModule, EmailModule],
    controllers: [NestAuthController],
    providers: [
        NestAuthService,
        AuthRepository,
        AuthSessionService,
        FirebaseAdminAuthService,
        EmailVerificationService,
        VerifiedEmailGuard,
        PasswordResetService,
        EmailChangeService,
    ],
    exports: [
        NestAuthService,
        AuthRepository,
        AuthSessionService,
        FirebaseAdminAuthService,
        EmailVerificationService,
        VerifiedEmailGuard,
        PasswordResetService,
        EmailChangeService,
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
