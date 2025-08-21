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
        // console.log(`User requested page number ${event.selected}, which is offset ${newOffset}`);
        setItemOffset(newOffset);
    };
    const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const searchValue = event.target.value;
        setSearchTerm(searchValue);
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
                                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        )
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
            <main className="admin__account">
                <section className="admin__dashboard-summary" style={{ marginBottom: 24 }}>
                    <h4>Account Summary</h4>
                    <ul>
                        <li>
                            <strong>Total Accounts:</strong> {accounts.length}
                        </li>
                        <li>
                            <strong>Visible (filtered):</strong> {filteredAccounts.length}
                        </li>
                        <li>
                            <strong>Search:</strong> {searchTerm || "All"}
                        </li>
                    </ul>
                </section>
                <div className="admin__account__list">
                    <section className="admin__account__list__search">
                        <div>
                            <h4>List of accounts</h4>
                            <input
                                type="text"
                                name="product"
                                id="product"
                                placeholder="Search customer"
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </section>
                    <section className="admin__account__list__table">
                        <Table responsive striped borderless hover>
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
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                            }}
                        >
                            <ReactPaginate
                                className="shops__container__main__pagination__items"
                                breakLabel="..."
                                nextLabel="Next"
                                onPageChange={handlePageClick}
                                pageRangeDisplayed={5}
                                pageCount={pageCount}
                                previousLabel="Previous"
                                renderOnZeroPageCount={null}
                            />
                        </div>
                    </section>
                </div>
            </main>
        </AdminLayout>
    );
};

export default AdminAccountPage;
