import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import AdminLayout from "../../../components/layout/AdminLayout";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { useToast } from "../../../context/ToastContext";
import { fetchSupportTickets, updateSupportTicket, type SupportTicket } from "../../support/api";

const statuses = ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER", "RESOLVED", "CLOSED"] as const;
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(value));

const AdminSupportPage = () => {
    const { addToast } = useToast();
    const [tickets, setTickets] = useState<SupportTicket[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const [updatingId, setUpdatingId] = useState<number | null>(null);

    const loadTickets = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            setTickets(await fetchSupportTickets(statusFilter || undefined));
            setHasLoaded(true);
        } catch (error) {
            setLoadError(getAdminRequestError(error));
            if (hasLoaded) addToast("Support", "Refresh failed. Showing the latest saved tickets.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadTickets();
    }, [statusFilter]);

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
        () => filteredTickets.filter((ticket) => ["OPEN", "IN_PROGRESS", "WAITING_FOR_CUSTOMER"].includes(ticket.status)).length,
        [filteredTickets],
    );

    const handleUpdate = async (ticket: SupportTicket, input: { status?: string; priority?: string }) => {
        try {
            setUpdatingId(ticket.id);
            const updated = await updateSupportTicket(ticket.id, input);
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
                <title>Support tickets | Digital-E</title>
                <meta name="description" content="Manage persisted customer support tickets." />
            </Helmet>
            <main className="admin__page admin__page--support">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Customer care</span>
                        <h1 className="admin__page__title">Support tickets</h1>
                        <p className="admin__page__subtitle">Manage the customer requests stored by the support workflow.</p>
                    </div>
                    <div className="admin__page__actions">
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter support tickets">
                            <option value="">All statuses</option>
                            {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                        </select>
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadTickets}>Refresh</button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card"><span>Visible tickets</span><strong>{filteredTickets.length}</strong><p>Current filters</p></div>
                    <div className="admin__summary-card"><span>Needs action</span><strong>{openCount}</strong><p>Open or waiting</p></div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Ticket queue</h3>
                            <span>{filteredTickets.length} visible tickets</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <label className="admin__sr-only" htmlFor="support-search">Search support tickets</label>
                                <input
                                    id="support-search"
                                    type="search"
                                    value={searchTerm}
                                    placeholder="Search subject, customer, order, status, or priority…"
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => setSearchTerm("")}
                                    disabled={!searchTerm}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    {loadError && !hasLoaded ? (
                        <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={loadTickets} />
                    ) : null}
                    {isLoading && !hasLoaded ? <AdminStatusPanel variant="loading" title="Loading support tickets" description="Fetching the latest customer requests." /> : null}
                    {loadError && hasLoaded ? (
                        <AdminStatusPanel variant="error" title="Refresh failed" description={loadError.message} onRetry={loadTickets} retryLabel="Retry refresh" />
                    ) : null}
                    {!isLoading && !loadError && hasLoaded && filteredTickets.length === 0 ? <AdminStatusPanel variant="empty" title="No support tickets match this filter" description="Try another status or search term." /> : null}
                    {(!loadError || hasLoaded) && !(isLoading && !hasLoaded) && filteredTickets.length > 0 ? <AdminTableScrollHint label="Support ticket list">
                        <table className="admin__table admin__table--support">
                            <thead>
                                <tr><th>Ticket</th><th>Customer / order</th><th>Status</th><th>Priority</th><th>Created</th></tr>
                            </thead>
                            <tbody>
                                {filteredTickets.map((ticket) => (
                                    <tr key={ticket.id}>
                                        <td>
                                            <strong>#{ticket.id} · {ticket.subject}</strong>
                                            <p>{ticket.message}</p>
                                            {ticket.admin_note ? <small>Admin note: {ticket.admin_note}</small> : null}
                                        </td>
                                        <td><span>{ticket.user_id || "Customer"}</span><small>{ticket.order_id ? `Order #${ticket.order_id}` : "General request"}</small></td>
                                        <td>
                                            <select
                                                value={ticket.status}
                                                disabled={updatingId === ticket.id}
                                                onChange={(event) => handleUpdate(ticket, { status: event.target.value })}
                                                aria-label={`Status for ticket ${ticket.id}`}
                                            >
                                                {statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={ticket.priority}
                                                disabled={updatingId === ticket.id}
                                                onChange={(event) => handleUpdate(ticket, { priority: event.target.value })}
                                                aria-label={`Priority for ticket ${ticket.id}`}
                                            >
                                                {priorities.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                                            </select>
                                        </td>
                                        <td>{formatDate(ticket.created_at)}</td>
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
