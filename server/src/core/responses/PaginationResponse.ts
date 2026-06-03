import type { PaginationMeta } from "#/shared/interfaces/Pagination";

export class PaginationResponse<T = unknown> {
    constructor(
        public items: T[],
        public pagination: PaginationMeta,
        public msg?: string,
    ) {}
}
