import React, { useEffect, useState } from "react";
import { Table } from "react-bootstrap";
import ReactPaginate from "react-paginate";
import axios from "../../../api/axios";
import { Role } from "../../../utils/interface";
import AccountItem from "../../common/admin/AdminAccountItem";
import AdminLayout from "../../layout/AdminLayout";
import { Helmet } from "react-helmet";

interface Account {
    id: string;
    email: string;
    password: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    role: Role;
    created_at: Date;
    showPassword: boolean;
}

const ITEMS_PER_PAGE = 5;

const AdminAccountPage = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [itemOffset, setItemOffset] = useState(0);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [filteredAccounts, setFilteredAccounts] = useState<Account[]>(accounts);
    const endOffset = itemOffset + ITEMS_PER_PAGE;
    const currentAccounts = filteredAccounts.slice(itemOffset, endOffset);
    const pageCount = Math.ceil(filteredAccounts.length / ITEMS_PER_PAGE);

    const handlePageClick = (event: any) => {
        const newOffset = (event.selected * ITEMS_PER_PAGE) % accounts.length;
        setItemOffset(newOffset);
    };

    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
    };

    const handleClear = () => {
        setSearchTerm("");
    };

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await axios.get(`/api/users/`);
                if (response.status === 200) {
                    const newAccounts: Account[] = response.data.accounts.map((account: Account) => {
                        return {
                            ...account,
                            showPassword: false,
                        };
                    });
                    setAccounts(
                        newAccounts.sort(
                            (a: Account, b: Account) =>
                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                        ),
                    );
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchUsers();
        return () => {};
    }, []);

    useEffect(() => {
        const filtered = accounts.filter((account) => {
            const lowerSearchTerm = searchTerm.toLowerCase();
            setItemOffset(0);
            return (
                account.id.toLowerCase().includes(lowerSearchTerm) ||
                account.username.toLowerCase().includes(lowerSearchTerm) ||
                account.role.toLowerCase().includes(lowerSearchTerm) ||
                account.email.toLowerCase().includes(lowerSearchTerm)
            );
        });
        setFilteredAccounts(filtered);
        return () => {};
    }, [searchTerm, accounts]);

    return (
        <AdminLayout>
            <Helmet>
                <title>Admin Account Management</title>
                <meta name="description" content="Manage user accounts and roles." />
            </Helmet>
            <main className="admin__page admin__page--accounts">
                <header className="admin__page__header">
                    <div>
                        <span className="admin__page__eyebrow">Users</span>
                        <h2 className="admin__page__title">Accounts</h2>
                        <p className="admin__page__subtitle">Review roles, access levels, and account activity.</p>
                    </div>
                </header>

                <section className="admin__summary">
                    <div className="admin__summary-card">
                        <span>Total accounts</span>
                        <strong>{accounts.length}</strong>
                        <p>All users</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Visible</span>
                        <strong>{filteredAccounts.length}</strong>
                        <p>Filtered view</p>
                    </div>
                    <div className="admin__summary-card">
                        <span>Search</span>
                        <strong>{searchTerm ? "Active" : "All"}</strong>
                        <p>{searchTerm || "No filter"}</p>
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
                                name="product"
                                id="product"
                                placeholder="Search accounts"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                            <button type="button" className="admin__button admin__button--ghost" onClick={handleClear}>
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="admin__card__body">
                        <Table responsive hover borderless className="admin__table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Account ID</th>
                                    <th>Username</th>
                                    <th>Role</th>
                                    <th>Email</th>
                                    <th>Password</th>
                                    <th>Date created</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentAccounts.map((account) => (
                                    <AccountItem key={account.id} accounts={filteredAccounts} account={account} />
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
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                renderOnZeroPageCount={null}
                            />
                        </div>
                    </div>
                </section>
            </main>
        </AdminLayout>
    );
};

export default AdminAccountPage;
