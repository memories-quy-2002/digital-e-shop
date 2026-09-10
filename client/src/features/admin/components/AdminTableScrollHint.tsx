import type { ReactNode } from "react";

type AdminTableScrollHintProps = {
    children: ReactNode;
    label: string;
    hint?: string;
};

const AdminTableScrollHint = ({
    children,
    label,
    hint = "Swipe horizontally to view more columns.",
}: AdminTableScrollHintProps) => (
    <div className="admin__table-scroll-region" role="region" aria-label={label} tabIndex={0}>
        <p className="admin__table-scroll-region__hint">{hint}</p>
        <div className="admin__table-wrap">{children}</div>
    </div>
);

export default AdminTableScrollHint;
