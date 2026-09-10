import { ForbiddenException, Injectable, SetMetadata, UnauthorizedException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express-serve-static-core";
import { UsersRepository } from "../users/users.repository";

export const VERIFIED_EMAIL_KEY = "verifiedEmailRequired";
export const RequireVerifiedEmail = () => SetMetadata(VERIFIED_EMAIL_KEY, true);

const normalizeRole = (role?: string | null) => String(role || "").toLowerCase();

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly usersRepository: UsersRepository,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<boolean>(VERIFIED_EMAIL_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required) return true;

        const req = context.switchToHttp().getRequest<Request>();
        const userId = req.user?.id;
        if (!userId) throw new UnauthorizedException({ msg: "Not authenticated" });

        const user = await this.usersRepository.findById(String(userId));
        if (!user) throw new UnauthorizedException({ msg: "User not found" });
        if (normalizeRole(user.role) === "admin") return true;

        // A missing column means the additive migration has not been applied;
        // preserve access for existing accounts until the migration is available.
        if (user.email_verified_at === undefined || Boolean(user.email_verified_at)) return true;

        throw new ForbiddenException({
            msg: "Please verify your email before continuing.",
            code: "EMAIL_VERIFICATION_REQUIRED",
            emailVerified: false,
        });
    }
}
