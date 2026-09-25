import { HTTP_STATUS } from "#src/shared/constants/http-status";

export class AppError extends Error {
    statusCode: number;
    code?: string;
    details?: Record<string, unknown>;

    constructor(message: string, statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR, code?: string, details?: Record<string, unknown>) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
