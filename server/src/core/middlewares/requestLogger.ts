import type { NextFunction, Request, Response } from "express";
import { logger } from "#src/shared/utils/logger";
import { REQUEST_ID_HEADER, resolveRequestId } from "#src/middleware/request-id.middleware";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.requestId || resolveRequestId(req.headers["x-request-id"]);
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        logger.info(
            {
                method: req.method,
                url: req.originalUrl || req.url,
                statusCode: res.statusCode,
                durationMs: Number(durationMs.toFixed(1)),
                requestId,
            },
            "http request",
        );
    });

    next();
};

