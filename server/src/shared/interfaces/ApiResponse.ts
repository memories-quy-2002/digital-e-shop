import type { PaginationMeta } from "#/shared/interfaces/Pagination";

export interface ApiResponse<T = unknown> {
    msg?: string;
    error?: string;
    data?: T;
}

export interface PaginatedApiResponse<T = unknown> {
    items: T[];
    pagination: PaginationMeta;
    msg?: string;
}
