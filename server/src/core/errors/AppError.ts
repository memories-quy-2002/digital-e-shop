export class AppError extends Error {
    statusCode: number;
    code?: string;
    details?: Record<string, unknown>;

    constructor(message: string, statusCode = 500, code?: string, details?: Record<string, unknown>) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
