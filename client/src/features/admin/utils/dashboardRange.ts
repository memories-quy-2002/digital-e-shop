export const DASHBOARD_RANGES = ["7d", "30d", "90d"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "30d";

export function parseDashboardRange(value: string | null | undefined): DashboardRange {
    return DASHBOARD_RANGES.includes(value as DashboardRange)
        ? (value as DashboardRange)
        : DEFAULT_DASHBOARD_RANGE;
}

export function getDashboardRangeLabel(range: DashboardRange): string {
    return range === "7d" ? "Last 7 days" : range === "90d" ? "Last 90 days" : "Last 30 days";
}
