import React from "react";
import { Link } from "react-router-dom";
import "../../styles/components/_empty-state.scss";

type EmptyStateProps = {
    title: string;
    description?: string;
    actionLabel?: string;
    actionTo?: string;
    icon?: React.ReactNode;
    compact?: boolean;
    className?: string;
};

const EmptyState = ({
    title,
    description,
    actionLabel,
    actionTo,
    icon,
    compact = false,
    className = "",
}: EmptyStateProps) => {
    const classes = ["app-empty-state", "empty-state", compact ? "empty-state--compact" : "", className]
        .filter(Boolean)
        .join(" ");

    return (
        <div className={classes}>
            {icon ? <div className="empty-state__icon">{icon}</div> : null}
            <strong>{title}</strong>
            {description ? <p>{description}</p> : null}
            {actionLabel && actionTo ? (
                <Link to={actionTo} className="empty-state__action">
                    {actionLabel}
                </Link>
            ) : null}
        </div>
    );
};

export default EmptyState;
