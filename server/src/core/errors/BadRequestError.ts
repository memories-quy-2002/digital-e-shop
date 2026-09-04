import { HTTP_STATUS } from "#src/shared/constants/httpStatus";
import { AppError } from "./AppError";

export class BadRequestError extends AppError {
    constructor(message: string, details?: Record<string, unknown>) {
        super(message, HTTP_STATUS.BAD_REQUEST, "BAD_REQUEST", details);
    }
}

