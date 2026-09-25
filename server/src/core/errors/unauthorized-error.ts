import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { AppError } from "./app-error";

export class UnauthorizedError extends AppError {
    constructor(message: string, statusCode: number = HTTP_STATUS.UNAUTHORIZED, details?: Record<string, unknown>) {
        super(message, statusCode, "UNAUTHORIZED", details);
    }
}
