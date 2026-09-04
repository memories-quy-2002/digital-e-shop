import { Injectable, ForbiddenException, SetMetadata } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";

const normalizeRole = (role?: string | null) => (role ? String(role).toLowerCase() : "");

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const OWNER_PARAM_KEY = "ownerParamKey";
export const OwnerParam = (paramKey: string) => SetMetadata(OWNER_PARAM_KEY, paramKey);

@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private readonly reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        const ownerParamKey = this.reflector.getAllAndOverride<string | undefined>(OWNER_PARAM_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (!roles && !ownerParamKey) {
            return true;
        }

        const req = context.switchToHttp().getRequest<Request>();
        const actual = normalizeRole(req.user?.role as string | undefined);

        if (ownerParamKey) {
            if (actual === "admin") {
                return true;
            }

            const targetId =
                (req.params as Record<string, unknown>)[ownerParamKey] ||
                (req.body as Record<string, unknown>)[ownerParamKey];

            if (String(req.user?.id) === String(targetId)) {
                return true;
            }

            // Explicit body so the response matches the existing
            // requireOwnerOrAdmin middleware's { msg: "Forbidden" } shape.
            throw new ForbiddenException({ msg: "Forbidden" });
        }

        if (roles && roles.map(normalizeRole).includes(actual)) {
            return true;
        }

        throw new ForbiddenException({ msg: "Forbidden" });
    }
}
