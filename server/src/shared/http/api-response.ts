export type ApiSuccessResponse = Record<string, unknown> & {
    success: true;
    requestId: string;
};

export type ApiErrorResponse = Record<string, unknown> & {
    success: false;
    error: string;
    msg: string;
    code: string;
    requestId: string;
    details?: Record<string, unknown>;
};

type ErrorResponseInput = {
    statusCode: number;
    message: string;
    code?: string;
    details?: Record<string, unknown>;
    requestId?: string;
};

type RequestWithCorrelationId = {
    requestId?: string;
    get?: (header: string) => string | undefined;
};

const statusCodes = new Map<number, string>([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [422, "UNPROCESSABLE_ENTITY"],
    [429, "RATE_LIMITED"],
    [500, "INTERNAL_SERVER_ERROR"],
]);

export const requestIdFrom = (value: unknown): string => {
    const req = (value || {}) as RequestWithCorrelationId;
    if (req.requestId) {
        return req.requestId;
    }

    return typeof req.get === "function" ? req.get("x-request-id") || "unknown" : "unknown";
};

export const buildSuccessResponse = (body: unknown, requestId = "unknown"): ApiSuccessResponse => {
    if (body && typeof body === "object" && !Array.isArray(body)) {
        return {
            ...(body as Record<string, unknown>),
            success: true,
            requestId,
        };
    }

    return {
        data: body,
        success: true,
        requestId,
    };
};

export const buildErrorResponse = ({
    statusCode,
    message,
    code,
    details = {},
    requestId = "unknown",
}: ErrorResponseInput): ApiErrorResponse => ({
    ...details,
    success: false,
    error: message,
    msg: message,
    code: code || statusCodes.get(statusCode) || "HTTP_ERROR",
    requestId,
    ...(Object.keys(details).length > 0 ? { details } : {}),
});

export const errorCodeForStatus = (statusCode: number): string =>
    statusCodes.get(statusCode) || "HTTP_ERROR";
