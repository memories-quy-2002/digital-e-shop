import type { ReactNode } from "react";

export type AdminStatusPanelVariant = "loading" | "error" | "empty";

type AdminStatusPanelProps = {
    variant: AdminStatusPanelVariant;
    title: string;
    description: string;
    onRetry?: () => void;
    retryLabel?: string;
    children?: ReactNode;
};

const AdminStatusPanel = ({ variant, title, description, onRetry, retryLabel = "Retry", children }: AdminStatusPanelProps) => (
    <div
        className={`admin__status-panel admin__status-panel--${variant}`}
        role={variant === "error" ? "alert" : undefined}
        aria-live={variant === "loading" ? "polite" : undefined}
    >
        <strong>{title}</strong>
        <p>{description}</p>
        {children}
        {onRetry ? (
            <button type="button" className="admin__button admin__button--ghost" onClick={onRetry}>
                {retryLabel}
            </button>
        ) : null}
    </div>
);

export default AdminStatusPanel;
