import { Injectable } from '@nestjs/common';
import { parseBody } from '#src/shared/validation/request-schemas';
import { AnalyticsRepository } from './analytics.repository';
import { analyticsSummaryQuerySchema } from './analytics.validator';
import { resolveAnalyticsRange } from './analytics-range';
import { mapAnalyticsSummary } from './analytics-summary.mapper';

@Injectable()
export class NestAnalyticsService {
    constructor(private readonly analyticsRepository: AnalyticsRepository) {}

    async getAnalyticsSummary(rawQuery: Record<string, unknown>) {
        const queryParams = parseBody(analyticsSummaryQuerySchema, rawQuery);
        const range = resolveAnalyticsRange(queryParams);
        const rows = await this.analyticsRepository.getSummaryRows(range.days);

        return mapAnalyticsSummary(rows, range);
    }
}
