export type PaginatedResponse<T> = {
    data: T[];
    page?: number;
    limit?: number;
    total?: number;
};
