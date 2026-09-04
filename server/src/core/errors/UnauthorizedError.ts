import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { AppError } from "./AppError";

export class UnauthorizedError extends AppError {
    constructor(message: string, statusCode = HTTP_STATUS.UNAUTHORIZED, details?: Record<string, unknown>) {
        super(message, statusCode, "UNAUTHORIZED", details);
    }
}

