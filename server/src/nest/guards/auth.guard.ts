import { Injectable, UnauthorizedException, ForbiddenException } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { NestConfigService } from "../config/nest-config.service";
import { authService } from "#src/modules/auth/auth.service";
import { usersRepository } from "#src/modules/users/users.repository";

@Injectable()
export class AuthGuard implements CanActivate {
    constructor(private readonly config: NestConfigService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<Request>();

        const { valid, message } = await authService.verifySessionToken(req);
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
                [key: string]: unknown;
            };

            if (!payload.role && payload.id) {
                const user = await usersRepository.findById(payload.id);
                if (user?.role) {
                    payload.role = user.role;
                }
            }

            req.user = payload;
            return true;
        } catch {
            throw new ForbiddenException({ msg: "Invalid or expired token" });
        }
    }
}
