import type { NextFunction, Request, Response } from "express";
import { AppError } from "#/core/errors/AppError";
import { HTTP_STATUS } from "#/shared/constants/httpStatus";
import { MESSAGES } from "#/shared/constants/messages";
import type { DbError } from "#/shared/interfaces/database";
import { logger } from "#/shared/utils/logger";

export const errorHandler = (err: DbError | AppError, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json({ error: MESSAGES.invalidCsrf });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            msg: err.message,
            ...(err.details || {}),
        });
    }

    logger.error(err?.stack || err);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ error: MESSAGES.internalServerError });
};
