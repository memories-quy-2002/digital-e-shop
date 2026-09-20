export type ApiSuccessMetadata = {
    success: true;
    requestId: string;
    message?: string;
};

export type ApiErrorResponse = {
    success?: false;
    code?: string;
    message?: string;
    msg?: string;
    error?: string;
    requestId?: string;
    details?: Record<string, unknown>;
    [key: string]: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object";

const readString = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value : undefined;

export const getApiErrorPayload = (error: unknown): ApiErrorResponse | null => {
    if (!isRecord(error) || !isRecord(error.response) || !isRecord(error.response.data)) {
        return null;
    }

    return error.response.data as ApiErrorResponse;
};

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const payload = getApiErrorPayload(error);
    return readString(payload?.message)
        || readString(payload?.msg)
        || readString(payload?.error)
        || fallback;
};

export const getApiErrorCode = (error: unknown): string | undefined =>
    readString(getApiErrorPayload(error)?.code);

export const getApiSuccessMessage = (payload: unknown, fallback = ""): string => {
    if (!isRecord(payload)) return fallback;
    return readString(payload.message) || readString(payload.msg) || fallback;
};
