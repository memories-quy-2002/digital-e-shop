import { Injectable } from '@nestjs/common';
import { parseBody } from '#src/shared/validation/request-schemas';
import { AnalyticsRepository } from './analytics.repository';
import { analyticsSummaryQuerySchema } from './analytics.validator';
import { resolveAnalyticsRange } from './analytics-range';
import { mapAnalyticsSummary } from './analytics-summary.mapper';
import type { AnalyticsRangeKey } from './analytics-range';
import type { AnalyticsSummaryRows } from './analytics.types';

@Injectable()
export class NestAnalyticsService {
    private readonly pendingSummaryRows = new Map<AnalyticsRangeKey, Promise<AnalyticsSummaryRows>>();

    constructor(private readonly analyticsRepository: AnalyticsRepository) {}

    private getPendingSummaryRows(range: ReturnType<typeof resolveAnalyticsRange>): Promise<AnalyticsSummaryRows> {
        const existing = this.pendingSummaryRows.get(range.key);
        if (existing) return existing;

        const pending = Promise.resolve()
            .then(() => this.analyticsRepository.getSummaryRows(range.days))
            .finally(() => {
                if (this.pendingSummaryRows.get(range.key) === pending) this.pendingSummaryRows.delete(range.key);
            });
        this.pendingSummaryRows.set(range.key, pending);
        return pending;
    }

    async getAnalyticsSummary(rawQuery: Record<string, unknown>) {
        const queryParams = parseBody(analyticsSummaryQuerySchema, rawQuery);
        const range = resolveAnalyticsRange(queryParams);
        const rows = await this.getPendingSummaryRows(range);

        return mapAnalyticsSummary(rows, range);
    }
}
