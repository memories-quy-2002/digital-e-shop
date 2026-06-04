import type { ApiResponse as ApiResponseShape } from "#src/shared/interfaces/ApiResponse";

export class ApiResponse<T = unknown> implements ApiResponseShape<T> {
    constructor(
        public data?: T,
        public msg?: string,
        public error?: string,
    ) {}
}

