import { describe, expect, it } from "vitest";
import { Reflector } from "@nestjs/core";
import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import { RolesGuard, ROLES_KEY, OWNER_PARAM_KEY } from "../roles.guard";

function buildContext(
    reqOverrides: Partial<{ user: { id?: string; role?: string }; params: Record<string, unknown>; body: Record<string, unknown> }>,
    metadata: Record<string, unknown> = {},
): ExecutionContext {
    const handler = () => undefined;
    class TestClass {}

    if (metadata[ROLES_KEY] !== undefined) {
        Reflect.defineMetadata(ROLES_KEY, metadata[ROLES_KEY], handler);
    }
    if (metadata[OWNER_PARAM_KEY] !== undefined) {
        Reflect.defineMetadata(OWNER_PARAM_KEY, metadata[OWNER_PARAM_KEY], handler);
    }

    const req = { params: {}, body: {}, ...reqOverrides };
    const context = {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => handler,
        getClass: () => TestClass,
    } as unknown as ExecutionContext;

    return context;
}

describe("RolesGuard", () => {
    it("allows the request through when no roles/owner metadata is set", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext({});

        expect(guard.canActivate(context)).toBe(true);
    });

    it("allows an admin through a role-restricted route", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext({ user: { role: "admin" } }, { [ROLES_KEY]: ["admin"] });

        expect(guard.canActivate(context)).toBe(true);
    });

    it("rejects a customer from an admin-only route", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext({ user: { role: "customer" } }, { [ROLES_KEY]: ["admin"] });

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it("allows an admin through an owner-or-admin route regardless of the target id", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext(
            { user: { id: "1", role: "admin" }, params: { userId: "999" } },
            { [OWNER_PARAM_KEY]: "userId" },
        );

        expect(guard.canActivate(context)).toBe(true);
    });

    it("allows a customer through an owner-or-admin route when they own the target id", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext(
            { user: { id: "42", role: "customer" }, params: { userId: "42" } },
            { [OWNER_PARAM_KEY]: "userId" },
        );

        expect(guard.canActivate(context)).toBe(true);
    });

    it("rejects a customer from an owner-or-admin route when they do not own the target id", () => {
        const guard = new RolesGuard(new Reflector());
        const context = buildContext(
            { user: { id: "42", role: "customer" }, params: { userId: "999" } },
            { [OWNER_PARAM_KEY]: "userId" },
        );

        expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
});
