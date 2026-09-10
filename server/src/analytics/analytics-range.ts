import { z } from "zod";

export const ANALYTICS_RANGE_KEYS = ["7d", "30d", "90d"] as const;
export type AnalyticsRangeKey = (typeof ANALYTICS_RANGE_KEYS)[number];
export type AnalyticsRange = { key: AnalyticsRangeKey; days: 7 | 30 | 90 };

export const DEFAULT_ANALYTICS_RANGE: AnalyticsRangeKey = "30d";

const DAYS_BY_RANGE: Record<AnalyticsRangeKey, AnalyticsRange["days"]> = {
    "7d": 7,
    "30d": 30,
    "90d": 90,
};

export const analyticsRangeSchema = z.preprocess(
    (value) => (typeof value === "string" ? value : DEFAULT_ANALYTICS_RANGE),
    z.enum(ANALYTICS_RANGE_KEYS).catch(DEFAULT_ANALYTICS_RANGE),
);

export function resolveAnalyticsRange(rawQuery: unknown): AnalyticsRange {
    const query = rawQuery && typeof rawQuery === "object" ? rawQuery : {};
    const key = analyticsRangeSchema.parse((query as { range?: unknown }).range);
    return { key, days: DAYS_BY_RANGE[key] };
}
