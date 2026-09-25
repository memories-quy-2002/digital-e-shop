import type { NextFunction, Request, Response } from "express";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { MESSAGES } from "#src/shared/constants/messages";
import type { DbError } from "#src/shared/interfaces/database";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, requestIdFrom } from "#src/shared/http/api-response";

export const errorHandler = (err: DbError | AppError, req: Request, res: Response, _next: NextFunction) => {
    void _next;
    const requestId = requestIdFrom(req);
    const requestContext = {
        requestId,
        method: req.method,
        route: req.route?.path ?? "unmatched route",
    };
    res.setHeader("X-Request-Id", requestId);
    if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
        logger.warn({
            ...requestContext,
            statusCode: HTTP_STATUS.FORBIDDEN,
            code: "INVALID_CSRF_TOKEN",
            event: "http request rejected",
        });
        return res.status(HTTP_STATUS.FORBIDDEN).json(buildErrorResponse({
            statusCode: HTTP_STATUS.FORBIDDEN,
            code: "INVALID_CSRF_TOKEN",
            message: MESSAGES.invalidCsrf,
            requestId,
        }));
    }

    if (err instanceof AppError) {
        const logContext = {
            ...requestContext,
            statusCode: err.statusCode,
            code: err.code,
            event: err.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "http request failed" : "http request rejected",
        };
        if (err.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
            logger.error({ ...logContext, err });
        } else {
            logger.warn(logContext);
        }
        return res.status(err.statusCode).json(buildErrorResponse({
            statusCode: err.statusCode,
            code: err.code,
            message: err.message,
            details: err.details,
            requestId,
        }));
    }

    logger.error({
        ...requestContext,
        err,
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: "INTERNAL_SERVER_ERROR",
        event: "http request failed",
    });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildErrorResponse({
        statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
        code: "INTERNAL_SERVER_ERROR",
        message: MESSAGES.internalServerError,
        requestId,
    }));
};

