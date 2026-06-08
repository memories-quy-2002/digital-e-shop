import type { NextFunction, Request, Response } from "express";
import { logger } from "#src/shared/utils/logger";

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") {
        const startedAt = process.hrtime.bigint();
        res.on("finish", () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            logger.info(
                {
                    method: req.method,
                    url: req.originalUrl || req.url,
                    statusCode: res.statusCode,
                    durationMs: Number(durationMs.toFixed(1)),
                },
                "http request",
            );
        });
    }

    next();
};

