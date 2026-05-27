import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button, Modal, Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import { Role } from "../../../utils/interface";
import AdminLayout from "../../../components/layout/AdminLayout";
import { Helmet } from "react-helmet";
import { useToast } from "../../../context/ToastContext";

interface Account {
    id: string;
    email: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role;
    status?: "Active" | "Suspended";
    order_count?: number;
    created_at: Date;
}

type CustomerProfile = Account & {
    total_spent: number;
    wishlist_count: number;
    last_order_at: string | null;
    recent_orders: Array<{
        id: number;
        date_added: string;
        status: number;
        total_price: number;
        discount: number;
        payment_method?: string;
    }>;
};

const ITEMS_PER_PAGE = 8;

const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const getStatusLabel = (status: number) => {
    if (status === 1) return "Done";
    if (status === 0) return "Pending";
    return "Canceled";
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
    const [selectedProfile, setSelectedProfile] = useState<CustomerProfile | null>(null);
    const [showProfile, setShowProfile] = useState(false);
    const { addToast } = useToast();
    const deferredSearchTerm = useDeferredValue(searchTerm);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get("/api/users");
                if (response.status === 200) {
                    const newAccounts: Account[] = response.data.accounts.map((account: Account) => ({
                        ...account,
                        status: account.status || "Active",
                        order_count: Number(account.order_count) || 0,
                        created_at: new Date(account.created_at),
                    }));
                    setAccounts(
                        newAccounts.sort(
                            (a: Account, b: Account) =>
                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                        ),
                    );
                }
            } catch {
                addToast("Accounts", "Unable to load accounts.");
            }
        };
        fetchUsers();
    }, [addToast]);

    const filteredAccounts = useMemo(() => {
        const lowerSearchTerm = deferredSearchTerm.trim().toLowerCase();
        if (!lowerSearchTerm) return accounts;

        return accounts.filter((account) => {
            return (
                account.id.toLowerCase().includes(lowerSearchTerm) ||
                account.username.toLowerCase().includes(lowerSearchTerm) ||
                account.role.toLowerCase().includes(lowerSearchTerm) ||
                (account.status || "Active").toLowerCase().includes(lowerSearchTerm) ||
                account.email.toLowerCase().includes(lowerSearchTerm)
            );
        });
    }, [accounts, deferredSearchTerm]);

    const pageCount = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE);
    const currentAccounts = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredAccounts.slice(start, start + ITEMS_PER_PAGE);
    }, [currentPage, filteredAccounts]);

    useEffect(() => {
        if (currentPage > Math.max(pageCount, 1)) {
            setCurrentPage(1);
        }
    }, [currentPage, pageCount]);

    const handleUpdateAccount = async (account: Account, role: Role, status: "Active" | "Suspended") => {
        try {
            const response = await axios.put(`/api/users/${account.id}`, {
                role,
                status,
            });
            if (response.status === 200) {
                const updatedAccount = {
                    ...account,
                    ...response.data.account,
                    status: response.data.account.status || status,
                    order_count: account.order_count || 0,
                };
                setAccounts((currentAccounts) =>
                    currentAccounts.map((item) => (item.id === account.id ? updatedAccount : item)),
                );
                addToast("Accounts", "Account updated successfully.");
            }
        } catch {
            addToast("Accounts", "Unable to update account.");
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
            const response = await axios.get(`/api/users/${account.id}/profile`);
            if (response.status === 200) {
                setSelectedProfile({
                    ...response.data.profile,
                    created_at: new Date(response.data.profile.created_at),
                    order_count: Number(response.data.profile.order_count) || 0,
                    total_spent: Number(response.data.profile.total_spent) || 0,
                    wishlist_count: Number(response.data.profile.wishlist_count) || 0,
                    recent_orders: response.data.profile.recent_orders || [],
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
                        <h2 className="admin__page__title">Accounts</h2>
                        <p className="admin__page__subtitle">
                            Search every customer, review order counts, and adjust access status.
                        </p>
                    </div>
                    <div className="admin__page__actions">
                        <button type="button" className="admin__button admin__button--primary" onClick={exportAccountsCsv}>
                            Export customers CSV
                        </button>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total accounts</span>
                        <strong>{accounts.length}</strong>
                        <p>All users</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Customers</span>
                        <strong>{accounts.filter((account) => account.role === Role.Customer).length}</strong>
                        <p>Buyer accounts</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Suspended</span>
                        <strong>{accounts.filter((account) => account.status === "Suspended").length}</strong>
                        <p>Limited access</p>
                    </div>
                </section>

                <section className="admin__card">
                    <div className="admin__card__header">
                        <div>
                            <h3>Account list</h3>
                            <span>{filteredAccounts.length} results</span>
                        </div>
                        <div className="admin__filters">
                            <input
                                type="text"
                                name="account-search"
                                id="account-search"
                                placeholder="Search all users by name, email, role, or status"
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
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>User</th>
                                    <th>Email</th>
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
                                        <td width="50px">{(currentPage - 1) * ITEMS_PER_PAGE + index + 1}</td>
                                        <td width="260px">
                                            <div className="admin__table__stack">
                                                <strong>{getDisplayName(account)}</strong>
                                                <span>@{account.username}</span>
                                            </div>
                                        </td>
                                        <td width="240px">
                                            <div className="admin__table__stack admin__table__stack--compact">
                                                <strong>{account.email}</strong>
                                            </div>
                                        </td>
                                        <td width="100px">
                                            <span className="admin__table__value">{account.order_count || 0}</span>
                                        </td>
                                        <td width="150px">
                                            <select
                                                className="admin__table__select"
                                                value={account.role}
                                                onChange={(event) =>
                                                    handleUpdateAccount(account, event.target.value as Role, account.status || "Active")
                                                }
                                            >
                                                <option value={Role.Customer}>Customer</option>
                                                <option value={Role.Admin}>Admin</option>
                                            </select>
                                        </td>
                                        <td width="150px">
                                            <select
                                                className="admin__table__select"
                                                value={account.status || "Active"}
                                                onChange={(event) =>
                                                    handleUpdateAccount(
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
                                        <td width="150px">
                                            <span className="admin__table__value">
                                                {new Date(account.created_at).toLocaleDateString("en-GB")}
                                            </span>
                                        </td>
                                        <td width="120px">
                                            <button
                                                type="button"
                                                className="admin__button admin__button--ghost"
                                                onClick={() => handleOpenProfile(account)}
                                            >
                                                Profile
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </Table>
                        <div className="admin__table__pagination">
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                pageClassName="pagination__item"
                                pageLinkClassName="pagination__link"
                                previousClassName="pagination__item"
                                nextClassName="pagination__item"
                                breakClassName="pagination__item"
                                activeClassName="selected"
                                disabledClassName="disabled"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={(event) => setCurrentPage(event.selected + 1)}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                forcePage={Math.max(currentPage - 1, 0)}
                                renderOnZeroPageCount={null}
                            />
                        </div>
                    </div>
                </section>

                <Modal show={showProfile} onHide={() => setShowProfile(false)} centered size="lg">
                    <Modal.Header closeButton>
                        <Modal.Title>Customer profile</Modal.Title>
                    </Modal.Header>
                    <Modal.Body>
                        {selectedProfile ? (
                            <div className="admin__customer-profile">
                                <section className="admin__customer-profile__hero">
                                    <div>
                                        <span>Customer</span>
                                        <strong>{selectedProfile.username}</strong>
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
                                    <h4>Recent orders</h4>
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
                                        <p>No orders yet.</p>
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

