import React, { useDeferredValue, useEffect, useRef, useState } from "react";
import { Button, Modal, Table } from "../../../components/ui/legacy";
import ReactPaginate from "react-paginate";
import { Role } from "../../../types/user";
import type { AdminAccount as Account, AdminCustomerProfile as CustomerProfile } from "../../../types/order";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet-async";
import { useToast } from "../../../context/ToastContext";
import { fetchAdminUsersPage, updateAccount, fetchCustomerProfile, type AdminListPagination } from "../api";
import AdminStatusPanel from "../components/AdminStatusPanel";
import AdminTableScrollHint from "../components/AdminTableScrollHint";
import { getAdminRequestError, type AdminRequestError } from "../utils/adminRequestError";
import { formatCurrency } from "../../../utils/currency";
import { getOrderStatusKey } from "../../orders/orderStatus";
import { getApiErrorMessage } from "../../../lib/api-contract";

const ITEMS_PER_PAGE = 8;
const emptyPagination: AdminListPagination = { page: 1, limit: ITEMS_PER_PAGE, total: 0, totalPages: 0 };
type AccountChange = { account: Account; role: string; status: "Active" | "Suspended" };

const getStatusLabel = (status: number) => {
    const labels = { pending: "Pending", done: "Done", canceled: "Canceled", unknown: "Unknown" };
    return labels[getOrderStatusKey(status)];
};

const getDisplayName = (account: Account) => {
    const firstName = account.first_name?.trim() || "";
    const lastName = account.last_name?.trim() || "";
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || account.username;
};

const AdminAccountPage = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState(emptyPagination);
    const [accountSummary, setAccountSummary] = useState({ total: 0, customers: 0, suspended: 0 });
    const [pendingChange, setPendingChange] = useState<AccountChange | null>(null);
    const [changeReason, setChangeReason] = useState("");
    const [isSavingChange, setIsSavingChange] = useState(false);
    const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | null>(null);
    const [showProfile, setShowProfile] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [hasLoaded, setHasLoaded] = useState(false);
    const [loadError, setLoadError] = useState<AdminRequestError | null>(null);
    const hasLoadedRef = useRef(false);
    const requestSequence = useRef(0);
    const { addToast } = useToast();
    const deferredSearchTerm = useDeferredValue(searchTerm);

    const loadUsers = React.useCallback(async () => {
        const requestId = ++requestSequence.current;
        try {
            setIsLoading(true);
            setLoadError(null);
            const data = await fetchAdminUsersPage({ page: currentPage, limit: ITEMS_PER_PAGE, search: deferredSearchTerm });
            if (requestId !== requestSequence.current) return;
            const newAccounts: Account[] = data.items.map((account) => ({
                    ...account,
                    status: account.status || "Active",
                    order_count: Number(account.order_count) || 0,
                    created_at: new Date(account.created_at),
            }));
            setAccounts(newAccounts);
            setPagination(data.pagination);
            setAccountSummary(data.summary);
            setHasLoaded(true);
            hasLoadedRef.current = true;
        } catch (error) {
            if (requestId !== requestSequence.current) return;
            setLoadError(getAdminRequestError(error));
            if (hasLoadedRef.current) addToast("Accounts", "Refresh failed. Showing the latest saved accounts.");
        } finally {
            if (requestId === requestSequence.current) setIsLoading(false);
        }
    }, [addToast, currentPage, deferredSearchTerm]);

    useEffect(() => { loadUsers(); }, [loadUsers]);

    const filteredAccounts = accounts;
    const pageCount = pagination.totalPages;
    const currentAccounts = accounts;

    useEffect(() => {
        if (currentPage > Math.max(pageCount, 1)) {
            setCurrentPage(1);
        }
    }, [currentPage, pageCount]);

    const requestAccountChange = (account: Account, role: string, status: "Active" | "Suspended") => {
        if (role === account.role && status === (account.status || "Active")) return;
        setChangeReason("");
        setPendingChange({ account, role, status });
    };

    const handleUpdateAccount = async () => {
        if (!pendingChange || changeReason.trim().length < 8) return;
        const { account, role, status } = pendingChange;
        try {
            setIsSavingChange(true);
            const result = await updateAccount(account.id, { role, status, reason: changeReason.trim() });
            const updatedAccount = {
                ...account,
                ...result.account,
                status: result.account?.status || status,
                order_count: account.order_count || 0,
            };
            setAccounts((currentAccounts) =>
                currentAccounts.map((item) => (item.id === account.id ? updatedAccount : item)),
            );
            setPendingChange(null);
            setChangeReason("");
            void loadUsers();
            addToast("Accounts", "Account updated successfully.");
        } catch (error) {
            addToast("Accounts", getApiErrorMessage(error, "Unable to update account."));
        } finally {
            setIsSavingChange(false);
        }
    };

    const exportAccountsCsv = () => {
        const rows = [
            ["id", "username", "email", "role", "status", "order_count", "created_at"],
            ...accounts.map((account) => [
                account.id,
                account.username,
                account.email,
                account.role,
                account.status || "Active",
                String(account.order_count || 0),
                new Date(account.created_at).toISOString(),
            ]),
        ];
        const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "digital-e-customers.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleOpenProfile = async (account: Account) => {
        try {
            const profile = await fetchCustomerProfile(account.id);
            if (profile) {
                setSelectedProfile({
                    ...profile,
                    created_at: new Date(profile.created_at),
                    order_count: Number(profile.order_count) || 0,
                    total_spent: Number(profile.total_spent) || 0,
                    wishlist_count: Number(profile.wishlist_count) || 0,
                    recent_orders: profile.recent_orders || [],
                });
                setShowProfile(true);
            }
        } catch {
            addToast("Customer profile", "Unable to load customer profile.");
        }
    };

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Accounts | Digital-E</title>
                <meta name="description" content="Manage user accounts and roles." />
            </Helmet>
            <main className="admin__page admin__page--accounts">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Users</span>
                        <h1 className="admin__page__title">Accounts</h1>
                        <p className="admin__page__subtitle">
                            Search every customer, review order counts, and adjust access status.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--ghost" onClick={loadUsers}>Refresh</button>
                        <button type="button" className="admin__button admin__button--primary" onClick={exportAccountsCsv}>
                            Export loaded page CSV
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total accounts</span>
                        <strong>{accountSummary.total}</strong>
                        <p>All users</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Customers</span>
                        <strong>{accountSummary.customers}</strong>
                        <p>Buyer accounts</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Suspended</span>
                        <strong>{accountSummary.suspended}</strong>
                        <p>Limited access</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header admin__card__header--stacked">
                        <div>
                            <h3>Account list</h3>
                            <span>{pagination.total} results</span>
                        </div>
                        <div className="admin__list-toolbar">
                            <div className="admin__filters">
                                <label className="admin__sr-only" htmlFor="account-search">
                                    Search accounts
                                </label>
                                <input
                                    type="search"
                                    name="account-search"
                                    id="account-search"
                                    placeholder="Search all users by name, email, role, or status…"
                                    value={searchTerm}
                                    onChange={(event) => {
                                        setSearchTerm(event.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                                <button
                                    type="button"
                                    className="admin__button admin__button--ghost"
                                    onClick={() => {
                                        setSearchTerm("");
                                        setCurrentPage(1);
                                    }}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="admin__card__body admin__list-shell">
                        {loadError && !hasLoaded ? <AdminStatusPanel variant="error" title={loadError.title} description={loadError.message} onRetry={loadUsers} /> : null}
                        {isLoading && !hasLoaded ? <AdminStatusPanel variant="loading" title="Loading accounts" description="Fetching the latest customer accounts." /> : null}
                        {loadError && hasLoaded ? <AdminStatusPanel variant="error" title="Refresh failed" description={loadError.message} onRetry={loadUsers} retryLabel="Retry refresh" /> : null}
                        {!isLoading && !loadError && hasLoaded && filteredAccounts.length === 0 ? <AdminStatusPanel variant="empty" title="No accounts found" description="No accounts match the current search." /> : null}
                        {(!loadError || hasLoaded) && !(isLoading && !hasLoaded) && filteredAccounts.length > 0 ? <>
                        <AdminTableScrollHint label="Account list">
                        <Table responsive={false} hover borderless className="admin__table admin__table--accounts">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Account</th>
                                    <th>Orders</th>
                                    <th>Role</th>
                                    <th>Status</th>
                                    <th>Date created</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentAccounts.map((account, index) => (
                                    <tr key={account.id}>
                                        <td className="admin__table__index">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                        <td className="admin__table__account-cell">
                                            <div className="admin__table__stack">
                                                <strong>{getDisplayName(account)}</strong>
                                                <span translate="no">@{account.username}</span>
                                                <small translate="no">{account.email}</small>
                                            </div>
                                        </td>
                                        <td className="admin__table__orders">
                                            <span className="admin__table__value">{account.order_count || 0}</span>
                                        </td>
                                        <td className="admin__table__role" data-label="Role">
                                            <select
                                                className="admin__table__select"
                                                value={account.role}
                                                onChange={(event) =>
                                                    requestAccountChange(account, event.target.value as Role, account.status || "Active")
                                                }
                                            >
                                                <option value={Role.Customer}>Customer</option>
                                                <option value={Role.Admin}>Admin</option>
                                            </select>
                                        </td>
                                        <td className="admin__table__status" data-label="Status">
                                            <select
                                                className="admin__table__select"
                                                value={account.status || "Active"}
                                                onChange={(event) =>
                                                    requestAccountChange(
                                                        account,
                                                        account.role,
                                                        event.target.value as "Active" | "Suspended",
                                                    )
                                                }
                                            >
                                                <option value="Active">Active</option>
                                                <option value="Suspended">Suspended</option>
                                            </select>
                                        </td>
                                        <td className="admin__table__date">
                                            <span className="admin__table__value">
                                                {new Date(account.created_at).toLocaleDateString("en-GB")}
                                            </span>
                                        </td>
                                        <td className="admin__table__account-action" data-label="Actions">
                                            <button
                                                type="button"
                                                className="admin__button admin__button--ghost admin__button--compact"
                                                onClick={() => handleOpenProfile(account)}
                                            >
                                                Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        </AdminTableScrollHint>
                        {pageCount > 1 ? <div className="admin__table__pagination">
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                pageClassName="pagination__item"
                                pageLinkClassName="pagination__link"
                                previousClassName="pagination__item"
                                nextClassName="pagination__item"
                                breakClassName="pagination__item"
                                activeClassName="selected"
                                disabledClassName="disabled"
                                breakLabel="…"
                                nextLabel="Next"
                                onPageChange={(event) => setCurrentPage(event.selected + 1)}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                forcePage={Math.max(currentPage - 1, 0)}
                                renderOnZeroPageCount={null}
                            />
                        </div> : null}
                        </> : null}
                    </div>
                </section>

                <Modal
                    show={Boolean(pendingChange)}
                    onHide={() => { if (!isSavingChange) setPendingChange(null); }}
                    centered
                    dialogClassName="admin__dialog"
                    contentClassName="admin__dialog__content"
                >
                    <Modal.Header closeButton={!isSavingChange}>
                        <Modal.Title>Confirm account access change</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        <p>This changes access to customer or admin tools. Add a reason to the audit history.</p>
                        <label htmlFor="account-change-reason">Reason (at least 8 characters)</label>
                        <textarea
                            id="account-change-reason"
                            className="admin__table__input"
                            rows={3}
                            maxLength={500}
                            value={changeReason}
                            onChange={(event) => setChangeReason(event.target.value)}
                            required
                        />
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" disabled={isSavingChange} onClick={() => setPendingChange(null)}>Cancel</Button>
                        <Button variant="primary" disabled={isSavingChange || changeReason.trim().length < 8} onClick={handleUpdateAccount}>
                            {isSavingChange ? "Saving…" : "Confirm change"}
                        </Button>
                    </Modal.Footer>
                </Modal>

                <Modal
                    show={showProfile}
                    onHide={() => setShowProfile(false)}
                    centered
                    size="lg"
                    dialogClassName="admin__dialog"
                    contentClassName="admin__dialog__content"
                >
                    <Modal.Header closeButton>
                        <Modal.Title>Customer profile</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {selectedProfile ? (
                            <div className="admin__customer-profile">
                                <section className="admin__customer-profile__hero">
                                    <div className="admin__customer-profile__hero-copy">
                                        <span>Customer</span>
                                        <strong>{getDisplayName(selectedProfile)}</strong>
                                        <small>@{selectedProfile.username}</small>
                                        <p>{selectedProfile.email}</p>
                                    </div>
                                    <span
                                        className={
                                            selectedProfile.status === "Suspended"
                                                ? "admin__pill admin__pill--danger"
                                                : "admin__pill admin__pill--success"
                                        }
                                    >
                                        {selectedProfile.status || "Active"}
                                    </span>
                                </section>
                                <div className="admin__detail-section__header">
                                    <h4>Account health</h4>
                                    <p>Spending, wishlist activity, and current access status for this customer.</p>
                                </div>
                                <section className="admin__customer-profile__stats">
                                    <div>
                                        <span>Orders</span>
                                        <strong>{selectedProfile.order_count || 0}</strong>
                                    </div>
                                    <div>
                                        <span>Total spent</span>
                                        <strong>{formatCurrency(selectedProfile.total_spent)}</strong>
                                    </div>
                                    <div>
                                        <span>Wishlist</span>
                                        <strong>{selectedProfile.wishlist_count}</strong>
                                    </div>
                                    <div>
                                        <span>Role</span>
                                        <strong>{selectedProfile.role}</strong>
                                    </div>
                                </section>
                                <section className="admin__customer-profile__orders">
                                    <div className="admin__detail-section__header">
                                        <h4>Recent orders</h4>
                                        <p>Latest purchase activity associated with this account.</p>
                                    </div>
                                    {selectedProfile.recent_orders.length > 0 ? (
                                        selectedProfile.recent_orders.map((order) => (
                                            <div key={order.id}>
                                                <strong>#{order.id}</strong>
                                                <span>{getStatusLabel(Number(order.status))}</span>
                                                <span>{formatCurrency(Number(order.total_price) - Number(order.discount))}</span>
                                                <small>{new Date(order.date_added).toLocaleString()}</small>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="admin__customer-profile__empty">No orders yet.</p>
                                    )}
                                </section>
                            </div>
                        ) : null}
                    </Modal.Body>
                    <Modal.Footer>
                        <Button variant="secondary" onClick={() => setShowProfile(false)}>
                            Close
                        </Button>
                    </Modal.Footer>
                </Modal>
            </main>
        </AdminLayout>
    );
};

export default AdminAccountPage;

