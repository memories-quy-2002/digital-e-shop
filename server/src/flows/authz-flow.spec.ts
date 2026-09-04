import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ExecutionContext } from "@nestjs/common";
import { OWNER_PARAM_KEY, RolesGuard, ROLES_KEY } from "../guards/roles.guard";

function contextFor(req: Record<string, unknown>, metadata: Record<string, unknown>): ExecutionContext {
    const handler = (): undefined => undefined;
    class RouteClass {}
    Reflect.defineMetadata(ROLES_KEY, metadata[ROLES_KEY], handler);
    Reflect.defineMetadata(OWNER_PARAM_KEY, metadata[OWNER_PARAM_KEY], handler);
    return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => handler,
        getClass: () => RouteClass,
    } as unknown as ExecutionContext;
}

describe("critical authorization flow", () => {
    it("allows an owner or admin and rejects a different customer", () => {
        const guard = new RolesGuard(new Reflector());

        expect(guard.canActivate(contextFor(
            { user: { id: "customer-1", role: "customer" }, params: { uid: "customer-1" }, body: {} },
            { [OWNER_PARAM_KEY]: "uid" },
        ))).toBe(true);

        expect(guard.canActivate(contextFor(
            { user: { id: "admin-1", role: "admin" }, params: { uid: "customer-2" }, body: {} },
            { [OWNER_PARAM_KEY]: "uid" },
        ))).toBe(true);

        expect(() => guard.canActivate(contextFor(
            { user: { id: "customer-1", role: "customer" }, params: { uid: "customer-2" }, body: {} },
            { [OWNER_PARAM_KEY]: "uid" },
        ))).toThrow(ForbiddenException);
    });

    it("rejects a customer from an admin-only route", () => {
        const guard = new RolesGuard(new Reflector());

        expect(() => guard.canActivate(contextFor(
            { user: { id: "customer-1", role: "customer" }, params: {}, body: {} },
            { [ROLES_KEY]: ["admin"] },
        ))).toThrow(ForbiddenException);
    });
});
