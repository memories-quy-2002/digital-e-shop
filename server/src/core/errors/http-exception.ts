import { HttpException } from "@nestjs/common";

type HttpExceptionResponse = string | Record<string, unknown>;

const normalizeCause = (cause: unknown): Error => {
    if (cause instanceof Error) return cause;

    const message = typeof cause === "string" ? cause : "A non-Error value was thrown";
    return new Error(message, { cause });
};

export const createHttpException = (
    cause: unknown,
    response: HttpExceptionResponse,
    statusCode: number,
): HttpException => new HttpException(response, statusCode, { cause: normalizeCause(cause) });
