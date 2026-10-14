import { HttpException } from "@nestjs/common";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { createHttpException } from "./http-exception";

type ErrorWithStatus = {
    statusCode?: number;
    message?: string;
};

export const mapToHttpException = (error: unknown, fallbackMessage: string): HttpException => {
    if (error instanceof HttpException) return error;

    const typedError = error as ErrorWithStatus | null | undefined;
    const statusCode = Number(typedError?.statusCode) || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR
        ? fallbackMessage
        : typedError?.message || fallbackMessage;

    return createHttpException(error, { msg }, statusCode);
};
