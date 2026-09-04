import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { AppError } from "./AppError";

export class NotFoundError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, HTTP_STATUS.NOT_FOUND, "NOT_FOUND", details);
    }
}

