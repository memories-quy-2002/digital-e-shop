import { Button } from "../../../components/ui/button";
import {
    getDashboardRangeLabel,
    type DashboardRange,
} from "../utils/dashboardRange";

type AdminDashboardHeaderProps = {
    range: DashboardRange;
    onRangeChange: (range: DashboardRange) => void;
    loading: boolean;
    updateLabel: "Updated" | "Partially updated" | "Unable to load";
    lastUpdated: string | null;
    onRefresh: () => void;
    onDownloadReport: () => void;
};

const AdminDashboardHeader = ({
    range,
    onRangeChange,
    loading,
    updateLabel,
    lastUpdated,
    onRefresh,
    onDownloadReport,
}: AdminDashboardHeaderProps) => (
    <header className="admin__dashboard__header">
        <div className="admin__dashboard__header-copy">
            <p className="admin__dashboard__eyebrow">Operations overview</p>
            <h1>Admin dashboard</h1>
            <p className="admin__dashboard__header-description">
                Monitor revenue, order queues, and inventory signals from one operational view.
            </p>
        </div>

        <div className="admin__dashboard__header-controls">
            <div className="admin__dashboard__range-control">
                <label htmlFor="dashboard-range">Analytics range</label>
                <select
                    id="dashboard-range"
                    value={range}
                    onChange={(event) => onRangeChange(event.target.value as DashboardRange)}
                >
                    <option value="7d">{getDashboardRangeLabel("7d")}</option>
                    <option value="30d">{getDashboardRangeLabel("30d")}</option>
                    <option value="90d">{getDashboardRangeLabel("90d")}</option>
                </select>
            </div>

            <div className="admin__dashboard__freshness" aria-live="polite" role="status">
                <span className={`admin__dashboard__freshness-dot admin__dashboard__freshness-dot--${updateLabel === "Updated" ? "ready" : "attention"}`} aria-hidden="true" />
                <span>{updateLabel}</span>
                <span className="admin__dashboard__freshness-time">
                    {lastUpdated ? `Last checked ${lastUpdated}` : "Waiting for first update"}
                </span>
            </div>

            <div className="admin__dashboard__header-actions">
                <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
                <Button type="button" onClick={onDownloadReport}>
                    Download report
                </Button>
            </div>
        </div>
    </header>
);

export type { AdminDashboardHeaderProps };
export default AdminDashboardHeader;
