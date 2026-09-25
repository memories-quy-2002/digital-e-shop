import React from "react";
import { BellIcon } from "../../../components/common/Icons";
import { useT } from "../../../hooks/useT";
import type { ProductAlertKey, ProductAlertPreference } from "../types";
import "../../../styles/features/products/_product-alerts.scss";

type ProductAlertControlsProps = {
    preference: ProductAlertPreference;
    variant?: "product" | "wishlist";
    saving?: boolean;
    preferenceLoaded?: boolean;
    preferenceLoading?: boolean;
    saved?: boolean;
    error?: string | null;
    loadError?: string | null;
    onRetryLoad?: () => void;
    onToggle: (key: ProductAlertKey, enabled: boolean) => void;
};

const ProductAlertControls = ({
    preference,
    variant = "product",
    saving = false,
    preferenceLoaded = true,
    preferenceLoading = false,
    saved = false,
    error = null,
    loadError = null,
    onRetryLoad,
    onToggle,
}: ProductAlertControlsProps) => {
    const t = useT();
    const options: Array<{ key: ProductAlertKey; label: string; description: string }> = [
        {
            key: "priceDropEnabled",
            label: t("wishlistAlerts.priceDropLabel"),
            description: t("wishlistAlerts.priceDropDescription"),
        },
        {
            key: "backInStockEnabled",
            label: t("wishlistAlerts.backInStockLabel"),
            description: t("wishlistAlerts.backInStockDescription"),
        },
    ];

    return (
        <section
            className={`product-alert-controls product-alert-controls--${variant}`}
            data-testid="product-alert-controls"
            aria-busy={saving || preferenceLoading}
        >
            <div className="product-alert-controls__heading">
                <span className="product-alert-controls__icon" aria-hidden="true"><BellIcon size={18} /></span>
                <div>
                    <h3>{t("wishlistAlerts.heading")}</h3>
                    <p>{t("wishlistAlerts.description")}</p>
                </div>
            </div>

            <div className="product-alert-controls__options">
                {options.map(({ key, label, description }) => {
                    const enabled = preference[key];
                    const stateClass = preferenceLoaded
                        ? enabled ? " is-on" : ""
                        : " is-unknown";
                    return (
                        <div className="product-alert-controls__option" key={key}>
                            <div className="product-alert-controls__copy">
                                <strong>{label}</strong>
                                <span>{description}</span>
                            </div>
                            <span className="product-alert-controls__state">
                                {preferenceLoaded
                                    ? enabled ? t("wishlistAlerts.enabled") : t("wishlistAlerts.disabled")
                                    : preferenceLoading ? t("common.loading") : null}
                            </span>
                            <button
                                type="button"
                                role={preferenceLoaded ? "switch" : undefined}
                                className={`product-alert-controls__switch${stateClass}`}
                                aria-label={label}
                                aria-checked={preferenceLoaded ? enabled : undefined}
                                disabled={saving || preferenceLoading || !preferenceLoaded}
                                onClick={() => onToggle(key, !enabled)}
                            >
                                <span className="product-alert-controls__thumb" aria-hidden="true" />
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="product-alert-controls__status" aria-live="polite">
                {saving ? t("wishlistAlerts.updating") : saved ? t("wishlistAlerts.updated") : null}
            </div>
            {error ? <div className="product-alert-controls__error" role="alert">{error}</div> : null}
            {loadError ? <div className="product-alert-controls__error" role="alert">{loadError}</div> : null}
            {!preferenceLoaded && loadError && onRetryLoad ? (
                <button className="product-alert-controls__retry" type="button" onClick={onRetryLoad}>
                    {t("wishlistAlerts.retry")}
                </button>
            ) : null}
        </section>
    );
};

export default ProductAlertControls;
