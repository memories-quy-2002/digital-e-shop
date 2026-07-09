import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import { AllExceptionsFilter } from "../all-exceptions.filter";
import { AppError } from "#src/core/errors/AppError";
import { MESSAGES } from "#src/shared/constants/messages";

function buildHost(): { host: ArgumentsHost; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const host = {
        switchToHttp: () => ({
            getResponse: () => ({ status }),
            getRequest: () => ({}),
        }),
    } as unknown as ArgumentsHost;
    return { host, json, status };
}

describe("AllExceptionsFilter", () => {
    it("returns 403 with invalidCsrf error shape for CSRF errors", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();

        filter.catch({ code: "EBADCSRFTOKEN" } as never, host);

        expect(status).toHaveBeenCalledWith(403);
        expect(json).toHaveBeenCalledWith({ error: MESSAGES.invalidCsrf });
    });

    it("returns AppError statusCode with msg + details shape", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();
        const err = new AppError("Not found", 404, "NOT_FOUND", { resource: "product" });

        filter.catch(err, host);

        expect(status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith({ msg: "Not found", resource: "product" });
    });

    it("returns 500 with internalServerError shape for unknown errors", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();

        filter.catch(new Error("boom"), host);

        expect(status).toHaveBeenCalledWith(500);
        expect(json).toHaveBeenCalledWith({ error: MESSAGES.internalServerError });
    });

    it("respects a NestJS HttpException's own status and response instead of falling to 500", () => {
        const filter = new AllExceptionsFilter();
        const { host, json, status } = buildHost();
        const err = new NotFoundException("Cannot GET /does-not-exist");

        filter.catch(err, host);

        expect(status).toHaveBeenCalledWith(404);
        expect(json).toHaveBeenCalledWith(err.getResponse());
    });
});
