import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/badge";
import AdminStatusPanel from "./AdminStatusPanel";
import type { DashboardAlertGroup } from "../utils/dashboardAlerts";
import type { DashboardSectionStatus } from "../utils/dashboardAvailability";

type AdminDashboardAttentionProps = {
    status: DashboardSectionStatus;
    groups: DashboardAlertGroup[];
    onRetry: () => void;
};

const priorityVariant = (priority: DashboardAlertGroup["priority"]) => {
    if (priority === "High") return "danger" as const;
    if (priority === "Medium") return "signal" as const;
    return "secondary" as const;
};

const AdminDashboardAttention = ({ status, groups, onRetry }: AdminDashboardAttentionProps) => {
    let content;

    if (status === "loading") {
        content = (
            <AdminStatusPanel
                variant="loading"
                title="Loading operational alerts"
                description="Checking orders, payments, inventory, support, and customer signals."
            />
        );
    } else if (status === "error") {
        content = (
            <AdminStatusPanel
                variant="error"
                title="Needs attention is unavailable"
                description="The alert feed could not be loaded. Your analytics remain available."
                onRetry={onRetry}
                retryLabel="Retry alerts"
            />
        );
    } else if (groups.length === 0) {
        content = (
            <AdminStatusPanel
                variant="empty"
                title="No active operational alerts"
                description="Queues are clear across the current admin signals."
            />
        );
    } else {
        content = (
            <div className="admin__dashboard__attention-grid">
                {groups.map((group) => (
                    <article className={`admin__dashboard__attention-card admin__dashboard__attention-card--${group.priority.toLowerCase()}`} key={group.type}>
                        <div className="admin__dashboard__attention-card-topline">
                            <Badge variant={priorityVariant(group.priority)}>{group.priority} priority</Badge>
                            <span className="admin__dashboard__attention-count">
                                {group.count} {group.count === 1 ? "item" : "items"}
                            </span>
                        </div>
                        <h3>{group.title}</h3>
                        <p>{group.description}</p>
                        <Link className="admin__dashboard__attention-action" to={group.route}>
                            {group.actionLabel}
                        </Link>
                    </article>
                ))}
            </div>
        );
    }

    return (
        <section className="admin__dashboard__attention" aria-label="Needs attention" role="region">
            <div className="admin__dashboard__section-heading">
                <div>
                    <p className="admin__dashboard__eyebrow">Live queue</p>
                    <h2>Needs attention</h2>
                </div>
                <span className="admin__dashboard__section-meta">Prioritized by urgency</span>
            </div>
            {content}
        </section>
    );
};

export type { AdminDashboardAttentionProps };
export default AdminDashboardAttention;
