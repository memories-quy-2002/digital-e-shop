import { beforeEach, describe, expect, it, vi } from "vitest";

const { logger } = vi.hoisted(() => ({
    logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("#src/shared/utils/logger", () => ({
    logger,
}));

import { registerScalarDocs } from "../scalarDocs";

describe("registerScalarDocs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("mounts the docs route synchronously when Scalar loads", () => {
        const app = { use: vi.fn() };
        const docsMiddleware = vi.fn();

        registerScalarDocs(app, { openapi: "spec" }, () => ({ apiReference: vi.fn(() => docsMiddleware) }));

        expect(app.use).toHaveBeenCalledWith("/docs", docsMiddleware);
    });

    it("logs and skips docs mounting when Scalar cannot be loaded", () => {
        const app = { use: vi.fn() };

        registerScalarDocs(app, { openapi: "spec" }, () => {
            throw new Error("missing scalar");
        });

        expect(app.use).not.toHaveBeenCalled();
        expect(logger.error).toHaveBeenCalled();
    });
});
