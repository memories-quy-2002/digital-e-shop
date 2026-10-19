import { Badge } from "../../../components/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "../../../components/ui/card";
import { Skeleton } from "../../../components/ui/skeleton";
import type { DashboardSectionStatus } from "../utils/dashboardAvailability";
import { useAdminDashboardCopy } from "../../../hooks/useAdminDashboardCopy";

type DashboardKpiDelta = {
    value: number;
    label?: string;
};

type AdminDashboardKpi = {
    label: string;
    value: string | number;
    description: string;
    status: DashboardSectionStatus;
    delta?: DashboardKpiDelta;
    href?: string;
};

type AdminDashboardKpiGridProps = {
    kpis: AdminDashboardKpi[];
};

const formatDelta = ({ value, label = "vs previous period" }: DashboardKpiDelta) => {
    const prefix = value > 0 ? "+" : "";
    return `${prefix}${value.toFixed(1)}% ${label}`;
};

const AdminDashboardKpiGrid = ({ kpis }: AdminDashboardKpiGridProps) => {
    const tx = useAdminDashboardCopy();
    return (
    <section className="admin__dashboard__kpis" aria-label={tx("Primary performance indicators")}>
        {kpis.map((kpi) => (
            <article className="admin__dashboard__kpi" data-status={kpi.status} key={kpi.label}>
                <Card className="admin__dashboard__kpi-card">
                    <CardHeader className="admin__dashboard__kpi-header">
                <CardTitle>{tx(kpi.label)}</CardTitle>
                <CardDescription>{tx(kpi.description)}</CardDescription>
                    </CardHeader>
                    <CardContent className="admin__dashboard__kpi-content">
                        <div className="admin__dashboard__kpi-value" data-value-status={kpi.status}>
                            {kpi.status === "loading" ? <Skeleton className="admin__dashboard__kpi-skeleton" aria-label={`${tx(kpi.label)} ${tx("loading")}`} /> : null}
                            {kpi.status === "error" ? tx("Unavailable") : null}
                            {kpi.status === "success" ? kpi.value : null}
                        </div>
                        {kpi.delta && kpi.status === "success" ? (
                            <Badge variant={kpi.delta.value < 0 ? "danger" : "electric"}>
                                {formatDelta({ ...kpi.delta, label: tx(kpi.delta.label || "vs previous period") })}
                            </Badge>
                        ) : null}
                        {kpi.href ? <a className="admin__dashboard__kpi-link" href={kpi.href}>{tx("View queue")}</a> : null}
                    </CardContent>
                </Card>
            </article>
        ))}
    </section>
    );
};

export type { AdminDashboardKpi, AdminDashboardKpiGridProps, DashboardKpiDelta };
export default AdminDashboardKpiGrid;
