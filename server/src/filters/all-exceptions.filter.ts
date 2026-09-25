import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { AppError } from "#src/core/errors/app-error";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { MESSAGES } from "#src/shared/constants/messages";
import type { DbError } from "#src/shared/interfaces/database";
import { logger } from "#src/shared/utils/logger";
import { buildErrorResponse, errorCodeForStatus, requestIdFrom } from "#src/shared/http/api-response";

const responseDetails = (response: unknown): { message?: string; code?: string; details: Record<string, unknown> } => {
    if (typeof response === "string") {
        return { message: response, details: {} };
    }

    if (!response || typeof response !== "object") {
        return { details: {} };
    }

    const payload = response as Record<string, unknown>;
    const messageValue = payload.message || payload.msg || payload.error;
    const message = Array.isArray(messageValue) ? messageValue.join(", ") : String(messageValue || "Request failed");
    const details = Object.fromEntries(
        Object.entries(payload).filter(([key]) => !["success", "error", "msg", "message", "code", "requestId", "statusCode"].includes(key)),
    );

    return {
        message,
        code: typeof payload.code === "string" ? payload.code : undefined,
        details,
    };
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: DbError | AppError | HttpException | Error, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const req = ctx.getRequest<Request>();
        const err = exception as DbError | AppError;
        const statusCode = exception instanceof HttpException
            ? exception.getStatus()
            : exception instanceof AppError
                ? exception.statusCode
                : HTTP_STATUS.INTERNAL_SERVER_ERROR;
        const requestId = requestIdFrom(req);
        const requestContext = {
            requestId,
            method: req.method,
            route: req.route?.path ?? "unmatched route",
        };

        res.setHeader("X-Request-Id", requestId);

        if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
            logger.warn({ ...requestContext, statusCode: HTTP_STATUS.FORBIDDEN, event: "http request rejected" });
            res.status(HTTP_STATUS.FORBIDDEN).json(buildErrorResponse({
                statusCode: HTTP_STATUS.FORBIDDEN,
                code: "INVALID_CSRF_TOKEN",
                message: MESSAGES.invalidCsrf,
                requestId,
            }));
            return;
        }

        if (err instanceof AppError) {
            const response = buildErrorResponse({
                statusCode: err.statusCode,
                code: err.code,
                message: err.message,
                details: err.details,
                requestId,
            });
            const logContext = {
                ...requestContext,
                statusCode: err.statusCode,
                code: response.code,
                event: err.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? "http request failed" : "http request rejected",
            };
            if (err.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
                logger.error({ ...logContext, err });
            } else {
                logger.warn(logContext);
            }
            res.status(err.statusCode).json(response);
            return;
        }

        // Nest throws its own HttpExceptions for framework-level conditions (e.g. an
        // unmatched route's NotFoundException). Respect their status/response instead of
        // collapsing them into the generic 500 branch below, so routing behavior (404 for
        // unmatched paths) matches what the Express app being migrated already does.
        if (exception instanceof HttpException) {
            const normalized = responseDetails(exception.getResponse());
            const response = buildErrorResponse({
                statusCode,
                code: normalized.code || errorCodeForStatus(statusCode),
                message: normalized.message || "Request failed",
                details: normalized.details,
                requestId,
            });
            const cause = (exception as HttpException & { cause?: unknown }).cause;
            const logContext = {
                ...requestContext,
                statusCode,
                code: response.code,
            };
            if (statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
                logger.error({
                    ...logContext,
                    err: cause instanceof Error ? cause : exception,
                    event: "http request failed",
                });
            } else {
                logger.warn({ ...logContext, event: "http request rejected" });
            }
            res.status(statusCode).json(response);
            return;
        }

        logger.error(
            {
                err: exception instanceof Error ? exception : new Error(String(exception)),
                ...requestContext,
                statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                code: "INTERNAL_SERVER_ERROR",
                event: "http request failed",
            },
        );
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildErrorResponse({
            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            code: "INTERNAL_SERVER_ERROR",
            message: MESSAGES.internalServerError,
            requestId,
        }));
    }
}
