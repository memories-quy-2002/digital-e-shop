import type { NextFunction, Request, Response } from "express";
import { logger } from "#/shared/utils/logger";

export const requestLogger = (req: Request, _res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") {
        logger.info(`${req.method} request for '${req.url}'`);
    }

    next();
};
