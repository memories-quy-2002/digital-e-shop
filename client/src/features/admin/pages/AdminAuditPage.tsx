import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import { formatUtcDateTime } from "../../../utils/dateTime";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { fetchAdminAuditPage, type AdminAuditEvent, type AdminListPagination } from "../api";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { useT } from "../../../hooks/useT";

const PAGE_LIMIT = 25;
const initialPagination: AdminListPagination = { page: 1, limit: PAGE_LIMIT, total: 0, totalPages: 0 };

const getChangesLabel = (changes: unknown, emptyLabel: string, detailsLabel: string): string => {
    if (!changes) return emptyLabel;
    try {
        const parsed = typeof changes === "string" ? JSON.parse(changes) : changes;
        if (typeof parsed !== "object" || parsed === null) return String(parsed);

        const record = parsed as { before?: unknown; after?: unknown };
        if ("before" in record || "after" in record) {
            if ((typeof record.before === "object" && record.before !== null) || (typeof record.after === "object" && record.after !== null)) {
                return detailsLabel;
            }
            return `${JSON.stringify(record.before ?? "—")} → ${JSON.stringify(record.after ?? "—")}`;
        }
        return JSON.stringify(parsed);
    } catch {
        return String(changes);
    }
};

const getChangesDetails = (changes: unknown) => {
    if (typeof changes === "string") {
        try {
            return JSON.stringify(JSON.parse(changes), null, 2);
        } catch {
            return changes;
        }
    }
    return JSON.stringify(changes, null, 2);
};

const AdminAuditPage = () => {
    const [events, setEvents] = useState<AdminAuditEvent[]>([]);
    const [search, setSearch] = useState("");
    const [entityType, setEntityType] = useState<"" | AdminAuditEvent["entity_type"]>("");
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState(initialPagination);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const deferredSearch = useDeferredValue(search);
    const requestSequence = useRef(0);
    const t = useT();

    useEffect(() => {
        const requestId = ++requestSequence.current;
        const loadEvents = async () => {
            try {
                setIsLoading(true);
                setLoadError(null);
                const result = await fetchAdminAuditPage({
                    page,
                    limit: PAGE_LIMIT,
                    search: deferredSearch,
                    entityType: entityType || undefined,
                });
                if (requestId !== requestSequence.current) return;
                setEvents(result.items);
                setPagination(result.pagination);
                setHasLoaded(true);
            } catch (error) {
                if (requestId !== requestSequence.current) return;
                setLoadError(getAdminRequestError(error));
            } finally {
                if (requestId === requestSequence.current) setIsLoading(false);
            }
        };
        void loadEvents();
        return () => {
            requestSequence.current += 1;
        };
    }, [deferredSearch, entityType, page, reloadKey]);

    const updateSearch = (value: string) => {
        setSearch(value);
        setPage(1);
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>{t("adminAudit.title")} | Digital-E</title>
                <meta name="description" content={t("adminAudit.subtitle")} />
            </Helmet>
            <main className="admin__page admin__page--audit">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">{t("adminAudit.eyebrow")}</span>
                        <h1 className="admin__page__title">{t("adminAudit.title")}</h1>
                        <p className="admin__page__subtitle">{t("adminAudit.subtitle")}</p>
                    </div>
                </header>

                <section className="admin__card" aria-labelledby="admin-audit-title">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h2 id="admin-audit-title">{t("adminAudit.recordedChanges")}</h2>
                                <span aria-live="polite">{pagination.total} {t("adminAudit.events")}</span>
                        </div>
                        <div className="admin__notifications-toolbar__top">
                            <label className="admin__sr-only" htmlFor="admin-audit-search">{t("adminAudit.search")}</label>
                            <input
                                id="admin-audit-search"
                                className="admin__table__input"
                                type="search"
                                value={search}
                                onChange={(event) => updateSearch(event.target.value)}
                                placeholder={t("adminAudit.searchPlaceholder")}
                            />
                            <label className="admin__sr-only" htmlFor="admin-audit-entity">{t("adminAudit.entityFilter")}</label>
                            <select
                                id="admin-audit-entity"
                                className="admin__table__input"
                                value={entityType}
                                onChange={(event) => {
                                    setEntityType(event.target.value as typeof entityType);
                                    setPage(1);
                                }}
                            >
                                <option value="">{t("adminAudit.allChanges")}</option>
                                <option value="product">{t("adminAudit.products")}</option>
                                <option value="user">{t("adminAudit.accounts")}</option>
                                <option value="promotion">{t("adminAudit.promotions")}</option>
                            </select>
                        </div>
                    </div>

                    {loadError && !hasLoaded ? (
                        <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={() => setReloadKey((current) => current + 1)} retryLabel={t("adminAudit.retry")} />
                    ) : isLoading && !hasLoaded ? (
                        <AdminStatusPanel variant="loading" title={t("adminAudit.loading")} description={t("adminAudit.loadingDescription")} />
                    ) : loadError ? (
                        <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={() => setReloadKey((current) => current + 1)} retryLabel={t("adminAudit.retry")} />
                    ) : events.length === 0 ? (
                        <AdminStatusPanel variant="empty" title={t("adminAudit.empty")} description={t("adminAudit.emptyDescription")} />
                    ) : (
                        <AdminTableScrollHint label={t("adminAudit.title")}>
                            <table className="admin__table admin__table--audit">
                                <thead>
                                    <tr>
                                        <th scope="col">{t("adminAudit.time")}</th>
                                        <th scope="col">{t("adminAudit.administrator")}</th>
                                        <th scope="col">{t("adminAudit.action")}</th>
                                        <th scope="col">{t("adminAudit.record")}</th>
                                        <th scope="col">{t("adminAudit.reason")}</th>
                                        <th scope="col">{t("adminAudit.changes")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((event) => (
                                        <tr key={event.id}>
                                            <td>{formatUtcDateTime(event.created_at)}</td>
                                            <td>{event.actor_id}</td>
                                            <td>{getActionLabel(event.action, t)}</td>
                                            <td>{getEntityLabel(event.entity_type, t)} #{event.entity_id}</td>
                                            <td>{event.reason || t("adminAudit.noReason")}</td>
                                            <td>
                                                {event.changes ? (
                                                    <details>
                                                        <summary>{getChangesLabel(event.changes, t("adminAudit.noChanges"), t("adminAudit.viewChanges"))}</summary>
                                                        <pre>{getChangesDetails(event.changes)}</pre>
                                                    </details>
                                                ) : t("adminAudit.noChanges")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </AdminTableScrollHint>
                    )}

                    {pagination.totalPages > 1 ? (
                        <nav className="admin__table__pagination" aria-label={t("adminAudit.title")}>
                            <div className="pagination">
                                <button type="button" disabled={page <= 1 || isLoading} onClick={() => setPage((current) => current - 1)}>{t("adminAudit.previous")}</button>
                                <span aria-live="polite">{t("adminAudit.page")} {page} {t("adminAudit.of")} {pagination.totalPages}</span>
                                <button type="button" disabled={page >= pagination.totalPages || isLoading} onClick={() => setPage((current) => current + 1)}>{t("adminAudit.next")}</button>
                            </div>
                        </nav>
                    ) : null}
                </section>
            </main>
        </AdminLayout>
    );
};

const getActionLabel = (action: string, t: (key: string) => string) => {
    const actionKey: Record<string, string> = {
        "inventory.stock.adjusted": "adminAudit.actions.inventoryAdjusted",
        "user.access.updated": "adminAudit.actions.accountUpdated",
        "promotion.created": "adminAudit.actions.promotionCreated",
        "promotion.updated": "adminAudit.actions.promotionUpdated",
        "promotion.deactivated": "adminAudit.actions.promotionDeactivated",
    };
    const key = actionKey[action];
    return key ? t(key) : action;
};

const getEntityLabel = (entityType: AdminAuditEvent["entity_type"], t: (key: string) => string) =>
    t(`adminAudit.entityTypes.${entityType}`);

export default AdminAuditPage;
