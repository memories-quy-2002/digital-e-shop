import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { useToast } from "../../../context/ToastContext";
import { useLocale } from "../../../context/LocaleContext";
import { useAdminCopy } from "../../../hooks/useAdminCopy";
import { fetchSupportTickets, updateSupportTicket, type SupportTicket } from "../../support/api";
import {
    SUPPORT_PRIORITIES,
    SUPPORT_STATUSES,
    SUPPORT_STATUS,
    type SupportPriority,
    type SupportStatus,
} from "../../support/constants";

const formatDate = (value: string, locale: "en" | "vi") =>
    new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));

const AdminSupportPage = () => {
    const { addToast } = useToast();
    const { locale } = useLocale();
    const tx = useAdminCopy();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<SupportStatus | "">("");
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const hasLoadedRef = useRef(false);

    const loadTickets = useCallback(async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            setTickets(await fetchSupportTickets(statusFilter || undefined));
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch (error) {
            setLoadError(getAdminRequestError(error));
            if (hasLoadedRef.current) addToast("Support", "Refresh failed. Showing the latest saved tickets.");
        } finally {
            setIsLoading(false);
        }
    }, [addToast, statusFilter]);

    useEffect(() => {
        void loadTickets();
    }, [loadTickets]);

    const filteredTickets = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return tickets;

        return tickets.filter((ticket) =>
            [
                ticket.subject,
                ticket.message,
                ticket.admin_note,
                ticket.status,
                ticket.priority,
                ticket.user_id,
                ticket.order_id ? `order ${ticket.order_id}` : "",
            ]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(term)),
        );
    }, [searchTerm, tickets]);

    const openCount = useMemo(
        () => filteredTickets.filter((ticket) =>
            ticket.status === SUPPORT_STATUS.OPEN
            || ticket.status === SUPPORT_STATUS.IN_PROGRESS
            || ticket.status === SUPPORT_STATUS.WAITING_FOR_CUSTOMER,
        ).length,
        [filteredTickets],
    );

    const handleUpdate = async (ticket: SupportTicket, input: { status?: SupportStatus; priority?: SupportPriority }) => {
        try {
            setUpdatingId(ticket.id);
            const updated = await updateSupportTicket(ticket.public_id ?? ticket.id, input);
            setTickets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            addToast("Support", `Ticket #${ticket.id} updated.`);
        } catch {
            addToast("Support", "Unable to update this ticket.");
        } finally {
            setUpdatingId(null);
        }
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>{tx("Support tickets")} | Digital-E</title>
                <meta name="description" content="Manage persisted customer support tickets." />
            </Helmet>
            <main className="admin__page admin__page--support">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">{tx("Customer care")}</span>
                        <h1 className="admin__page__title">{tx("Support tickets")}</h1>
                        <p className="admin__page__subtitle">{tx("Manage the customer requests stored by the support workflow.")}</p>
                    </div>
                    <div className="admin__page__actions">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as SupportStatus | "")} aria-label={tx("Filter support tickets")}>
                            <option value="">{tx("All statuses")}</option>
                            {SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{tx(status.replaceAll("_", " "))}</option>)}
                        </select>
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadTickets}>{tx("Refresh")}</button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card"><span>{tx("Visible tickets")}</span><strong>{filteredTickets.length}</strong><p>{tx("Current filters")}</p></div>
                    <div className="admin__summary-card"><span>{tx("Needs action")}</span><strong>{openCount}</strong><p>{tx("Open or waiting")}</p></div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>{tx("Ticket queue")}</h3>
                            <span>{filteredTickets.length} {tx("visible tickets")}</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <label className="admin__sr-only" htmlFor="support-search">{tx("Search support tickets")}</label>
                                <input
                                    id="support-search"
                                    type="search"
                                    value={searchTerm}
                                    placeholder={tx("Search subject, customer, order, status, or priority…")}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => setSearchTerm("")}
                                    disabled={!searchTerm}
                                >
                                    {tx("Clear")}
                                </button>
                            </div>
                        </div>
                    </div>
                    {loadError && !hasLoaded ? (
                        <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={loadTickets} />
                    ) : null}
                    {isLoading && !hasLoaded ? <AdminStatusPanel variant="loading" title={tx("Loading support tickets")} description={tx("Fetching the latest customer requests.")} /> : null}
                    {loadError && hasLoaded ? (
                        <AdminStatusPanel variant="error" title={tx("Refresh failed")} description={loadError.message} onRetry={loadTickets} retryLabel={tx("Retry refresh")} />
                    ) : null}
                    {!isLoading && !loadError && hasLoaded && filteredTickets.length === 0 ? <AdminStatusPanel variant="empty" title={tx("No support tickets match this filter")} description={tx("Try another status or search term.")} /> : null}
                    {(!loadError || hasLoaded) && !(isLoading && !hasLoaded) && filteredTickets.length > 0 ? <AdminTableScrollHint label={tx("Support ticket list")}>
                        <table className="admin__table admin__table--support">
                            <thead>
                                <tr><th>{tx("Ticket")}</th><th>{tx("Customer / order")}</th><th>{tx("Status")}</th><th>{tx("Priority")}</th><th>{tx("Created")}</th></tr>
                            </thead>
                            <tbody>
                                {filteredTickets.map((ticket) => (
                                    <tr key={ticket.id}>
                                        <td>
                                            <strong>#{ticket.id} · {ticket.subject}</strong>
                                            <p>{ticket.message}</p>
                                            {ticket.admin_note ? <small>{tx("Admin note:")} {ticket.admin_note}</small> : null}
                                        </td>
                                        <td><span>{ticket.user_id || tx("Customer")}</span><small>{ticket.order_id ? `${tx("Order")} #${ticket.order_id}` : tx("General request")}</small></td>
                                        <td>
                                            <select
                                                value={ticket.status}
                                                disabled={updatingId === ticket.id}
                                                onChange={(event) => handleUpdate(ticket, { status: event.target.value as SupportStatus })}
                                                aria-label={`${tx("Status")} ${tx("for ticket")} ${ticket.id}`}
                                            >
                                                {SUPPORT_STATUSES.map((status) => <option key={status} value={status}>{tx(status.replaceAll("_", " "))}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={ticket.priority}
                                                disabled={updatingId === ticket.id}
                                                onChange={(event) => handleUpdate(ticket, { priority: event.target.value as SupportPriority })}
                                                aria-label={`${tx("Priority")} ${tx("for ticket")} ${ticket.id}`}
                                            >
                            {SUPPORT_PRIORITIES.map((priority) => <option key={priority} value={priority}>{tx(priority)}</option>)}
                                            </select>
                                        </td>
                                        <td>{formatDate(ticket.created_at, locale)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </AdminTableScrollHint> : null}
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminSupportPage;
