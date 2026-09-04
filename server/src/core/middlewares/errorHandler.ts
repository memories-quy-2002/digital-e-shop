import type { NextFunction, Request, Response } from "express";
import { AppError } from "#src/core/errors/AppError";
import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { MESSAGES } from "#src/shared/constants/messages";
import type { DbError } from "#src/shared/interfaces/database";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, requestIdFrom } from "#src/shared/http/api-response";

export const errorHandler = (err: DbError | AppError, req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const requestId = requestIdFrom(req);
    res.setHeader("X-Request-Id", requestId);
    if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(buildErrorResponse({
            statusCode: HTTP_STATUS.FORBIDDEN,
            code: "INVALID_CSRF_TOKEN",
            message: MESSAGES.invalidCsrf,
            requestId,
        }));
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json(buildErrorResponse({
            statusCode: err.statusCode,
            code: err.code,
            message: err.message,
            details: err.details,
            requestId,
        }));
    }

    logger.error({ err, requestId, statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR }, "http request failed");
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildErrorResponse({
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: "INTERNAL_SERVER_ERROR",
        message: MESSAGES.internalServerError,
        requestId,
    }));
};

