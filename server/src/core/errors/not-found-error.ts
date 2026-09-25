import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { AppError } from "./app-error";

export class NotFoundError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, HTTP_STATUS.NOT_FOUND, "NOT_FOUND", details);
    }
}

