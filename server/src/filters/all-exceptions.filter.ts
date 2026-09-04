import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "#src/core/errors/AppError";
import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
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
    const messageValue = payload.msg || payload.message || payload.error;
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

        res.setHeader("X-Request-Id", requestId);

        if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
            logger.warn({ requestId, statusCode: HTTP_STATUS.FORBIDDEN }, "http request rejected");
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
            logger.warn({ requestId, statusCode: err.statusCode, code: response.code }, "http request rejected");
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
            logger.warn({ requestId, statusCode, code: response.code }, "http request rejected");
            res.status(statusCode).json(response);
            return;
        }

        logger.error(
            {
                err: exception instanceof Error ? exception : new Error(String(exception)),
                requestId,
                statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
                code: "INTERNAL_SERVER_ERROR",
            },
            "http request failed",
        );
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(buildErrorResponse({
            statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
            code: "INTERNAL_SERVER_ERROR",
            message: MESSAGES.internalServerError,
            requestId,
        }));
    }
}
