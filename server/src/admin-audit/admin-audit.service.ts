import { Injectable } from "@nestjs/common";
import { AdminAuditRepository } from "./admin-audit.repository";
import type { AdminAuditFilters } from "./admin-audit.repository";

@Injectable()
export class AdminAuditService {
    constructor(private readonly repository: AdminAuditRepository) {}

    async getEvents(page: number, limit: number, filters: AdminAuditFilters) {
        const total = await this.repository.getCount(filters);
        const totalPages = Math.ceil(total / limit);
        const effectivePage = Math.min(page, Math.max(totalPages, 1));
        const offset = (effectivePage - 1) * limit;
        const events = await this.repository.getPage(limit, offset, filters);
        return {
            events,
            pagination: { page: effectivePage, limit, total, totalPages },
        };
    }
}
