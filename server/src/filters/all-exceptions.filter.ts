import { Catch, HttpException } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { AppError } from "#src/core/errors/AppError";
import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { MESSAGES } from "#src/shared/constants/messages";
import type { DbError } from "#src/shared/interfaces/database";
import { logger } from "#src/shared/utils/logger";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    catch(exception: DbError | AppError | HttpException | Error, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();
        const err = exception as DbError | AppError;

        if (err && (err.code === "EBADCSRFTOKEN" || err.message === MESSAGES.invalidCsrf)) {
            res.status(HTTP_STATUS.FORBIDDEN).json({ error: MESSAGES.invalidCsrf });
            return;
        }

        if (err instanceof AppError) {
            res.status(err.statusCode).json({
                msg: err.message,
                ...(err.details || {}),
            });
            return;
        }

        // Nest throws its own HttpExceptions for framework-level conditions (e.g. an
        // unmatched route's NotFoundException). Respect their status/response instead of
        // collapsing them into the generic 500 branch below, so routing behavior (404 for
        // unmatched paths) matches what the Express app being migrated already does.
        if (exception instanceof HttpException) {
            res.status(exception.getStatus()).json(exception.getResponse());
            return;
        }

        logger.error((err as Error)?.stack || err);
        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            error: MESSAGES.internalServerError,
        });
    }
}
