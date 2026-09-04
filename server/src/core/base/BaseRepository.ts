import type { PaginationParams } from "#src/shared/interfaces/Pagination";

export class BaseRepository {
    protected normalizeLimit(limit?: number, max = 100, fallback = 20) {
        const parsed = Number(limit);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return fallback;
        }

        return Math.min(parsed, max);
    }

    protected getPagination(page?: number, limit?: number, max = 100, fallback = 20): PaginationParams {
        const normalizedPage = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
        const normalizedLimit = this.normalizeLimit(limit, max, fallback);

        return {
            page: normalizedPage,
            limit: normalizedLimit,
            offset: (normalizedPage - 1) * normalizedLimit,
        };
    }
}

