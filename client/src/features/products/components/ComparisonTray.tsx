import { Link } from "react-router-dom";
import { useComparison } from "../../../context/ComparisonContext";
import { useT } from "../../../hooks/useT";
import { Button, buttonVariants } from "../../../components/ui/button";
import { XCircleIcon } from "../../../components/common/Icons";

const ComparisonTray = () => {
    const t = useT();
    const { selectedIds, canCompare, remove, clear } = useComparison();

    if (selectedIds.length === 0) {
        return null;
    }

    return (
        <aside className="pointer-events-none relative z-[90] mt-4 w-full px-3 sm:fixed sm:inset-x-0 sm:bottom-4 sm:mt-0 sm:px-6" aria-label={t("comparison.trayLabel")}>
            <div className="pointer-events-auto mx-auto flex max-w-6xl flex-wrap items-center gap-3 rounded-panel border border-border-strong bg-card/95 p-3 shadow-[var(--de-shadow-md)] backdrop-blur">
                <div className="mr-auto min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{t("comparison.selectedCount", selectedIds.length)}</p>
                    <p className="text-xs text-muted-foreground">{t("comparison.trayHint")}</p>
                </div>
                <div className="flex max-w-full flex-wrap items-center gap-2" aria-label={t("comparison.selectedProducts")}>
                    {selectedIds.map((productId) => (
                        <span key={productId} className="inline-flex max-w-[10rem] items-center gap-1 rounded-control bg-mineral px-2 py-1 text-xs text-foreground">
                            <span className="truncate">{t("comparison.productId", productId)}</span>
                            <button
                                type="button"
                                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric"
                                onClick={() => remove(productId)}
                                aria-label={t("comparison.removeProduct", productId)}
                            >
                                <XCircleIcon size={15} />
                            </button>
                        </span>
                    ))}
                </div>
                <Button variant="ghost" size="sm" onClick={clear}>{t("comparison.clear")}</Button>
                {canCompare ? (
                    <Link className={`${buttonVariants({ size: "sm" })} shrink-0`} to={`/compare?ids=${selectedIds.join(",")}`}>
                        {t("comparison.compareNow")}
                    </Link>
                ) : (
                    <Button size="sm" disabled>{t("comparison.compareNow")}</Button>
                )}
            </div>
        </aside>
    );
};

export default ComparisonTray;
