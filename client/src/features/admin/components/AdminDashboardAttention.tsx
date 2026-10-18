import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import AdminStatusPanel from "./AdminStatusPanel";
import type { DashboardAlertGroup } from "../utils/dashboardAlerts";
import type { DashboardSectionStatus } from "../utils/dashboardAvailability";
import { useAdminDashboardCopy } from "../../../hooks/useAdminDashboardCopy";

type AdminDashboardAttentionProps = {
    status: DashboardSectionStatus;
    groups: DashboardAlertGroup[];
    onRetry: () => void;
    onOpenAlerts: (group: DashboardAlertGroup) => void;
};

const priorityVariant = (priority: DashboardAlertGroup["priority"]) => {
    if (priority === "High") return "danger" as const;
    if (priority === "Medium") return "signal" as const;
    return "secondary" as const;
};

const AdminDashboardAttention = ({ status, groups, onRetry, onOpenAlerts }: AdminDashboardAttentionProps) => {
    const tx = useAdminDashboardCopy();
    let content;

    if (status === "loading") {
        content = (
            <AdminStatusPanel
                variant="loading"
                title={tx("Loading operational alerts")}
                description={tx("Checking orders, payments, inventory, support, and customer signals.")}
            />
        );
    } else if (status === "error") {
        content = (
            <AdminStatusPanel
                variant="error"
                title={tx("Needs attention is unavailable")}
                description={tx("The alert feed could not be loaded. Your analytics remain available.")}
                onRetry={onRetry}
                retryLabel={tx("Retry alerts")}
            />
        );
    } else if (groups.length === 0) {
        content = (
            <AdminStatusPanel
                variant="empty"
                title={tx("No active operational alerts")}
                description={tx("Queues are clear across the current admin signals.")}
            />
        );
    } else {
        content = (
            <div className="admin__dashboard__attention-grid">
                {groups.map((group) => (
                    <article className={`admin__dashboard__attention-card admin__dashboard__attention-card--${group.priority.toLowerCase()}`} key={group.type}>
                        <div className="admin__dashboard__attention-card-topline">
                            <Badge variant={priorityVariant(group.priority)}>{tx(`${group.priority} priority`)}</Badge>
                            <span className="admin__dashboard__attention-count">
                                {group.count} {tx(group.count === 1 ? "item" : "items")}
                            </span>
                        </div>
                        <h3>{tx(group.title)}</h3>
                        <p>{tx(group.description)}</p>
                        <Link className="admin__dashboard__attention-action" to={group.route} onClick={() => onOpenAlerts(group)}>
                            {tx(group.actionLabel)}
                        </Link>
                    </article>
                ))}
            </div>
        );
    }

    return (
        <section className="admin__dashboard__attention" aria-label={tx("Needs attention")} role="region">
            <div className="admin__dashboard__section-heading">
                <div>
                    <p className="admin__dashboard__eyebrow">{tx("Live queue")}</p>
                    <h2>{tx("Needs attention")}</h2>
                </div>
                <span className="admin__dashboard__section-meta">{tx("Prioritized by urgency")}</span>
            </div>
            {content}
        </section>
    );
};

export type { AdminDashboardAttentionProps };
export default AdminDashboardAttention;
