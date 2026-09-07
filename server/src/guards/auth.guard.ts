import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import jwt from "jsonwebtoken";
import type { Request } from "express-serve-static-core";
import { NestConfigService } from "../config/nest-config.service";
import { NestAuthService } from "../auth/auth.service";
import { UsersRepository } from "../users/users.repository";
import { AuthRepository } from "../auth/auth.repository";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(
        private readonly config: NestConfigService,
        private readonly authService: NestAuthService,
        private readonly usersRepository: UsersRepository,
        private readonly authRepository: AuthRepository,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<Request>();

        const { valid, message } = await this.authService.verifySessionToken(req);
        if (!valid) {
            // Explicit body so the response matches the existing requireAuth
            // middleware's { msg: ... } shape, not Nest's default
            // { statusCode, message, error } UnauthorizedException body.
            throw new UnauthorizedException({ msg: message || "Not authenticated" });
        }

        const accessToken = req.cookies?.accessToken;
        try {
            const payload = jwt.verify(accessToken, this.config.get("jwtSecret")) as {
                id?: string;
                role?: string;
                sid?: number;
                [key: string]: unknown;
            };

            if (!payload.sid || String(payload.sid) !== String(req.cookies?.session)) {
                throw new UnauthorizedException({ msg: "Session mismatch" });
            }

            const session = await this.authRepository.getActiveSessionById(payload.sid);
            if (!session || String(session.user_id) !== String(payload.id)) {
                throw new UnauthorizedException({ msg: "Session invalid or expired" });
            }

            const user = payload.id ? await this.usersRepository.findById(payload.id) : null;
            if (!user) {
                throw new UnauthorizedException({ msg: "User not found" });
            }
            if (user.status && user.status !== "Active") {
                throw new UnauthorizedException({ msg: "Account is suspended" });
            }

            payload.role = user.role;
            req.user = payload;
            return true;
        } catch (error) {
            if (error instanceof UnauthorizedException) throw error;
            throw new ForbiddenException({ msg: "Invalid or expired token" });
        }
    }
}
