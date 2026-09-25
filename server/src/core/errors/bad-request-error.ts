import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { AppError } from "./app-error";

export class BadRequestError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST", details);
    }
}

