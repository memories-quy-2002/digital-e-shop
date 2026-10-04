import { HTTP_STATUS } from "#src/shared/constants/http-status";

export const createCheckoutError = (message: string, statusCode: number = HTTP_STATUS.CONFLICT, details: Record<string, unknown> = {}) =>
    Object.assign(new Error(message), { statusCode, details });
